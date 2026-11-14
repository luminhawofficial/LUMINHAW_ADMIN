(() => {
    const MATCH_CONFIDENCE_THRESHOLD = 0.8;
    const body = document.body;
    const moduleLabels = {
        dashboard: 'Dashboard',
        users: 'User Management',
        scans: 'AI Plant Identification',
        health: 'Plant Health Monitoring',
        garden: 'Garden Management',
        plants: 'Plant Library',
        subscriptions: 'Premium Subscriptions',
        payments: 'Payment Management',
        announcements: 'Announcements',
        reports: 'Reports & Analytics',
        admins: 'Admin Management',
        settings: 'System Settings',
    };
    const roleModules = {
        admin: Object.keys(moduleLabels),
        moderator: ['dashboard', 'scans', 'health', 'reports'],
    };
    const plantFactLabels = {
        image_url: 'Plant picture',
        common_name: 'Common name',
        scientific_name: 'Scientific name',
        tagalog_name: 'Tagalog name',
        bisaya_name: 'Bisaya name',
        description: 'Plant description',
        water_requirement: 'Water requirement',
        sunlight_requirement: 'Sunlight requirement',
        soil_requirement: 'Soil type',
        fertilizer: 'Fertilizer recommendation',
        growth_tips: 'Growth tips',
        common_diseases: 'Common diseases',
        treatment: 'Treatment',
        toxicity: 'Toxicity',
    };
    const moduleContent = document.querySelector('#module-content');
    const loginView = document.querySelector('#login-view');
    const appShell = document.querySelector('#app-shell');
    const loginForm = document.querySelector('#login-form');
    const loginError = document.querySelector('#login-error');
    const config = window.LUMINHAW_CONFIG;
    const supabaseSdk = window.supabase;
    let moduleName = 'dashboard';
    let role = '';
    let feedback;
    let moduleNote;
    const toast = document.querySelector('[data-toast]');
    const menuToggle = document.querySelector('[data-menu-toggle]');
    const scrim = document.querySelector('[data-close-menu]');
    const logoutButton = document.querySelector('[data-logout]');
    let toastTimer;
    let dashboardSummary = null;
    let userOffset = 0;
    let userSearchTimer;
    let plantSearchTimer;
    let adminClient = null;
    let authReady = Promise.resolve(false);
    let currentUser = null;
    let createdAt = 0;
    let lastActivityAt = 0;

    if (config?.supabaseUrl && config?.publishableKey && supabaseSdk?.createClient) {
        adminClient = supabaseSdk.createClient(config.supabaseUrl, config.publishableKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                storage: window.sessionStorage,
                detectSessionInUrl: true,
            },
        });
    } else {
        showLogin('Supabase configuration is missing. Configure the GitHub Pages repository variables and redeploy.');
    }

    const requestedModule = new URLSearchParams(window.location.search).get('module');
    if (requestedModule && moduleLabels[requestedModule]) {
        moduleName = requestedModule;
    }

    const closeMenu = () => {
        body.classList.remove('menu-open');
        menuToggle?.setAttribute('aria-expanded', 'false');
    };

    menuToggle?.addEventListener('click', () => {
        const isOpen = body.classList.toggle('menu-open');
        menuToggle.setAttribute('aria-expanded', String(isOpen));
    });
    scrim?.addEventListener('click', closeMenu);
    logoutButton?.addEventListener('click', async () => {
        if (!window.confirm('Are you sure you want to sign out?')) return;
        try {
            const { error } = await adminClient.auth.signOut({ scope: 'local' });
            window.sessionStorage.removeItem('luminhaw_admin_created_at');
            window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
            if (error) {
                showLogin('Your local session was cleared, but Supabase could not confirm sign-out.');
                showToast('Sign-out could not be completed. Please try again.');
                return;
            }
            showLogin();
        } catch {
            window.sessionStorage.removeItem('luminhaw_admin_created_at');
            window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
            showLogin('Your local session was cleared, but Supabase could not confirm sign-out.');
            showToast('Sign-out could not be completed. Please try again.');
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });

    loginForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!adminClient) {
            showLogin('Supabase configuration is missing. Configure the GitHub Pages repository variables and redeploy.');
            return;
        }
        const submitButton = loginForm.querySelector('[type="submit"]');
        submitButton.disabled = true;
        showLogin('');
        const formData = new FormData(loginForm);
        try {
            const { data, error } = await adminClient.auth.signInWithPassword({
                email: String(formData.get('email') ?? '').trim(),
                password: String(formData.get('password') ?? ''),
            });
            if (error || !data.session) {
                showLogin(error?.message === 'Email not confirmed'
                    ? 'Verify your email before signing in.'
                    : 'Sign-in failed. Check your credentials and administrator access.');
                return;
            }
            if (!await activateSession(data.session)) {
                await adminClient.auth.signOut({ scope: 'local' });
                window.sessionStorage.removeItem('luminhaw_admin_created_at');
                window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
            }
        } catch {
            showLogin('Sign-in is temporarily unavailable. Please try again later.');
        } finally {
            submitButton.disabled = false;
        }
    });

    document.querySelectorAll('[data-module-link]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            navigateToModule(link.dataset.moduleLink);
        });
    });
    document.querySelector('[data-home-link]')?.addEventListener('click', (event) => {
        event.preventDefault();
        navigateToModule('dashboard');
    });
    window.addEventListener('popstate', () => {
        if (currentUser) {
            const requested = new URLSearchParams(window.location.search).get('module') ?? 'dashboard';
            renderModule(requested);
            loadCurrentModule();
        }
    });

    async function requestApi(action, options = {}) {
        if (!await authReady || !adminClient) {
            throw new Error('Sign in with an active administrator account to continue.');
        }
        const { data, error } = await adminClient.functions.invoke('admin-api', {
            body: { action, ...(options.data ?? {}) },
        });
        if (error) {
            const status = error.context?.status;
            const code = await functionErrorCode(error);
            if (status === 401) {
                await adminClient.auth.signOut({ scope: 'local' });
                window.sessionStorage.removeItem('luminhaw_admin_created_at');
                window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
                showLogin('Your administrator session has expired. Sign in again.');
            }
            throw new Error(errorMessage(code));
        }
        return data;
    }

    async function functionErrorCode(error) {
        try {
            const response = error.context;
            if (response && typeof response.json === 'function') {
                const payload = await response.clone().json();
                return payload.error?.code ?? payload.code ?? payload.error ?? 'request_failed';
            }
        } catch {
            return 'request_failed';
        }
        return 'request_failed';
    }

    function errorMessage(code) {
        const messages = {
            dashboard_data_unavailable: 'Live dashboard data is unavailable. Check that the admin migration is applied.',
            user_records_unavailable: 'User records could not be loaded.',
            user_status_update_failed: 'The account status was not changed.',
            plant_catalog_unavailable: 'Plant catalog data could not be loaded.',
            plant_details_unavailable: 'Plant care or image details could not be loaded.',
            plant_catalog_save_failed: 'The plant record was not saved.',
            invalid_plant_catalog_record: 'Check the plant names, HTTPS picture URL, date, and field values.',
            plant_catalog_record_not_found: 'This plant record no longer exists. Reload the library and try again.',
            plant_catalog_audit_unavailable: 'The plant was saved, but its audit entry could not be written. Contact an administrator before retrying.',
            unsupported_admin_action: 'The deployed admin API does not support this action yet. Deploy an admin-api version that includes the requested action.',
            plant_reference_required: 'Add at least one source for every populated plant fact.',
            payment_records_unavailable: 'Payment records could not be loaded.',
            payment_review_failed: 'The payment review was not completed.',
            invalid_announcement: 'Provide both dates and make sure expiry is after the start date.',
            private_receipt_unavailable: 'A private receipt could not be opened safely.',
            announcement_create_failed: 'The announcement was not saved.',
            admin_role_assignment_failed: 'The administrator role was not changed. Check the target account and single-Admin protection.',
            garden_records_unavailable: 'Garden records could not be loaded.',
            subscription_records_unavailable: 'Subscription records could not be loaded.',
            announcements_unavailable: 'Announcements could not be loaded.',
            insufficient_role: 'Your administrator role cannot perform this action.',
            invalid_payment_review: 'Confirm the transaction or provide a rejection reason.',
            administrator_access_required: 'An active administrator role is required.',
        };
        return messages[code] ?? `Request failed (${code}).`;
    }

    function showLogin(message = '') {
        currentUser = null;
        window.clearInterval(window.luminhawSessionTimer);
        appShell.hidden = true;
        loginView.hidden = false;
        body.classList.add('login-page');
        loginError.textContent = message;
        loginError.hidden = message === '';
    }

    async function initializeAuth() {
        if (!adminClient) return false;
        const { data, error } = await adminClient.auth.getSession();
        if (error) {
            showLogin('Supabase authentication is temporarily unavailable. Please try again later.');
            return false;
        }
        if (!data.session) {
            showLogin();
            return false;
        }
        const active = await activateSession(data.session);
        if (!active) {
            await adminClient.auth.signOut({ scope: 'local' });
            window.sessionStorage.removeItem('luminhaw_admin_created_at');
            window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
        }
        return active;
    }

    async function activateSession(session) {
        const { data: userResponse, error: userError } = await adminClient.auth.getUser();
        const user = userResponse?.user;
        if (userError || !user || user.id !== session.user.id || !user.email_confirmed_at) {
            showLogin('A verified Supabase account is required. Check your email verification and sign in again.');
            return false;
        }

        const { data: context, error: contextError } = await adminClient.functions.invoke('admin-api', {
            body: { action: 'session' },
        });
        if (contextError) {
            const status = contextError.context?.status;
            showLogin(status === 401 || status === 403
                ? 'This account does not have active LUMINHAW administrator access.'
                : 'The LUMINHAW administrator service is temporarily unavailable.');
            return false;
        }
        if (context?.user_id !== user.id || !roleModules[context?.role]) {
            showLogin('This account does not have active LUMINHAW administrator access.');
            return false;
        }

        const now = Date.now();
        const savedCreatedAt = Number(window.sessionStorage.getItem('luminhaw_admin_created_at')) || now;
        const savedActivityAt = Number(window.sessionStorage.getItem('luminhaw_admin_last_activity_at')) || now;
        if (now - savedActivityAt > 30 * 60 * 1000 || now - savedCreatedAt > 8 * 60 * 60 * 1000) {
            await adminClient.auth.signOut({ scope: 'local' });
            window.sessionStorage.removeItem('luminhaw_admin_created_at');
            window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
            showLogin('Your administrator session expired. Please sign in again.');
            return false;
        }

        currentUser = user;
        role = context.role;
        authReady = Promise.resolve(true);
        createdAt = savedCreatedAt;
        lastActivityAt = savedActivityAt;
        window.sessionStorage.setItem('luminhaw_admin_created_at', String(createdAt));
        window.sessionStorage.setItem('luminhaw_admin_last_activity_at', String(lastActivityAt));
        appShell.hidden = false;
        loginView.hidden = true;
        body.classList.remove('login-page');
        document.querySelector('[data-profile-email]').textContent = user.email ?? 'Administrator';
        document.querySelector('[data-profile-role]').textContent = role.replaceAll('_', ' ');
        document.querySelector('[data-role-label]').textContent = role.replaceAll('_', ' ');
        const initial = String(user.email ?? 'A').slice(0, 1).toUpperCase();
        document.querySelector('[data-profile-initial]').textContent = initial;
        document.querySelector('[data-topbar-avatar]').textContent = initial;
        document.querySelector('[data-date]').textContent = new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }).toUpperCase();
        document.querySelector('[data-year]').textContent = String(new Date().getFullYear());
        document.querySelectorAll('[data-module-link]').forEach((link) => {
            link.hidden = !roleModules[role].includes(link.dataset.moduleLink);
        });

        renderModule(moduleName);
        initializeModuleControls();
        window.clearInterval(window.luminhawSessionTimer);
        window.luminhawSessionTimer = window.setInterval(checkSessionTimeout, 60_000);
        return true;
    }

    function checkSessionTimeout() {
        const now = Date.now();
        if (now - lastActivityAt > 30 * 60 * 1000 || now - createdAt > 8 * 60 * 60 * 1000) {
            adminClient.auth.signOut({ scope: 'local' }).finally(() => {
                window.sessionStorage.removeItem('luminhaw_admin_created_at');
                window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
                showLogin('Your administrator session expired. Please sign in again.');
            });
        }
    }

    let activityWriteAt = 0;
    const recordActivity = () => {
        const now = Date.now();
        if (now - activityWriteAt < 30_000 || !currentUser) return;
        activityWriteAt = now;
        lastActivityAt = now;
        window.sessionStorage.setItem('luminhaw_admin_last_activity_at', String(now));
    };
    document.addEventListener('pointerdown', recordActivity, { passive: true });
    document.addEventListener('keydown', recordActivity);

    adminClient?.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' && currentUser) {
            window.sessionStorage.removeItem('luminhaw_admin_created_at');
            window.sessionStorage.removeItem('luminhaw_admin_last_activity_at');
            showLogin('You have been signed out.');
        }
    });

    function renderModule(nextModule) {
        const permitted = roleModules[role] ?? [];
        if (!moduleLabels[nextModule] || !permitted.includes(nextModule)) {
            nextModule = 'dashboard';
            showToast('Your administrator role cannot access that page.');
        }
        moduleName = nextModule;
        body.dataset.module = moduleName;
        const template = document.getElementById(`module-${moduleName}`);
        moduleContent.replaceChildren(template.content.cloneNode(true));
        document.querySelector('[data-page-title]').textContent = moduleLabels[moduleName];
        document.querySelector('[data-breadcrumb]').textContent = moduleLabels[moduleName];
        document.querySelectorAll('[data-module-link]').forEach((link) => {
            const active = link.dataset.moduleLink === moduleName;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        feedback = moduleContent.querySelector('[data-feedback]');
        moduleNote = moduleContent.querySelector('[data-module-note]');
        closeMenu();
    }

    function navigateToModule(nextModule) {
        if (!currentUser) return;
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('module', nextModule);
        window.history.pushState({}, '', nextUrl);
        renderModule(nextModule);
        initializeModuleControls();
    }

    function initializeModuleControls() {
        moduleContent.querySelectorAll('[data-export-dashboard]').forEach((button) => {
            button.addEventListener('click', exportDashboard);
        });
        const search = moduleContent.querySelector('[data-module-search]');
        if (search && moduleName === 'users') {
            search.addEventListener('input', () => {
                window.clearTimeout(userSearchTimer);
                userSearchTimer = window.setTimeout(() => {
                    userOffset = 0;
                    loadUsers();
                }, 250);
            });
        }
        const plantSearch = moduleContent.querySelector('[data-plant-search]');
        plantSearch?.addEventListener('input', () => {
            window.clearTimeout(plantSearchTimer);
            plantSearchTimer = window.setTimeout(() => loadPlantLibrary(plantSearch.value.trim()), 250);
        });
        moduleContent.querySelector('[data-plant-add]')?.addEventListener('click', () => showPlantForm());
        moduleContent.querySelector('[data-plant-cancel]')?.addEventListener('click', () => {
            const form = moduleContent.querySelector('[data-plant-form]');
            form.reset();
            form.hidden = true;
        });
        const plantForm = moduleContent.querySelector('[data-plant-form]');
        if (plantForm) {
            initializePlantReferences(plantForm);
            plantForm.addEventListener('input', () => syncPlantReferenceRequirements(plantForm));
            plantForm.addEventListener('change', () => syncPlantReferenceRequirements(plantForm));
            plantForm.addEventListener('submit', savePlant);
        }
        moduleContent.querySelector('[data-page-prev]')?.addEventListener('click', () => {
            userOffset = Math.max(0, userOffset - 25);
            loadUsers();
        });
        moduleContent.querySelector('[data-page-next]')?.addEventListener('click', () => {
            userOffset += 25;
            loadUsers();
        });
        const announcementForm = moduleContent.querySelector('[data-announcement-form]');
        if (announcementForm) {
            announcementForm.elements.namedItem('published_at').value = localDateTimeValue(new Date());
        }
        announcementForm?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const publishedAt = new Date(String(formData.get('published_at') ?? ''));
            const expiresAt = new Date(String(formData.get('expires_at') ?? ''));
            if (
                Number.isNaN(publishedAt.getTime()) ||
                Number.isNaN(expiresAt.getTime()) ||
                expiresAt <= publishedAt
            ) {
                showToast('Choose a valid expiry date and time after the start date and time.');
                return;
            }
            try {
                await requestApi('announcements.create', {
                    method: 'POST',
                    data: {
                        ...Object.fromEntries(formData.entries()),
                        published_at: publishedAt.toISOString(),
                        expires_at: expiresAt.toISOString(),
                    },
                });
                form.reset();
                form.elements.namedItem('published_at').value = localDateTimeValue(new Date());
                showToast('Announcement saved. It will appear in the app feed during its scheduled dates.');
                await loadAnnouncements();
            } catch (error) {
                showToast(error.message);
            }
        });
        moduleContent.querySelector('[data-role-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            try {
                await requestApi('roles.set', {
                    method: 'POST',
                    data: Object.fromEntries(formData.entries()),
                });
                form.reset();
                showToast('Administrator role saved.');
                await loadAdmins();
            } catch (error) {
                showToast(error.message);
            }
        });
        loadCurrentModule();
    }

    function loadCurrentModule() {
        switch (moduleName) {
            case 'dashboard':
            case 'reports':
                loadDashboard();
                break;
            case 'users':
                loadUsers();
                break;
            case 'scans':
                loadPlantRecords('scans.list', false);
                break;
            case 'health':
                loadPlantRecords('health.list', true);
                break;
            case 'garden':
                loadGarden();
                break;
            case 'plants':
                loadPlantLibrary();
                break;
            case 'subscriptions':
                loadSubscriptions();
                break;
            case 'payments':
                loadPayments();
                break;
            case 'announcements':
                loadAnnouncements();
                break;
            case 'admins':
                loadAdmins();
                break;
        }
    }

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('visible');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 4200);
    }

    function setFeedback(message, isError = false) {
        if (feedback) {
            feedback.textContent = message;
            feedback.classList.toggle('is-error', isError);
        }
        if (moduleNote) {
            moduleNote.textContent = message;
            moduleNote.classList.toggle('is-error', isError);
        }
    }

    function createElement(tag, className = '', text = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== '') element.textContent = text;
        return element;
    }

    function cell(value, className = '') {
        return createElement('td', className, value === null || value === undefined || value === '' ? '—' : String(value));
    }

    function emptyRow(tbody, columns, message) {
        const row = document.createElement('tr');
        const item = cell(message);
        item.colSpan = columns;
        row.append(item);
        tbody.replaceChildren(row);
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
    }

    function localDateTimeValue(date) {
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16);
    }

    function announcementVisibility(announcement) {
        if (!announcement.is_active) return 'Inactive';
        const publishedAt = Date.parse(announcement.published_at);
        if (!Number.isFinite(publishedAt)) return 'Invalid schedule';
        if (publishedAt > Date.now()) return 'Scheduled';
        const expiresAt = announcement.expires_at === null
            ? Number.POSITIVE_INFINITY
            : Date.parse(announcement.expires_at);
        if (!Number.isFinite(expiresAt) && expiresAt !== Number.POSITIVE_INFINITY) {
            return 'Invalid schedule';
        }
        return expiresAt <= Date.now() ? 'Expired' : 'Visible in app';
    }

    function formatCount(value) {
        return Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : '—';
    }

    function formatMoney(value) {
        const amount = Number(value);
        return Number.isFinite(amount)
            ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
            : '—';
    }

    function statusBadge(value) {
        const label = String(value ?? 'unknown').replaceAll('_', ' ');
        const slug = label.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        return createElement('span', `status-pill status-${slug}`, label);
    }

    function setRows(rows, columns, renderRow) {
        const tbody = document.querySelector('[data-records]');
        if (!tbody) return;
        if (!Array.isArray(rows) || rows.length === 0) {
            emptyRow(tbody, columns, 'No matching records.');
            return;
        }
        tbody.replaceChildren(...rows.map(renderRow));
    }

    async function loadDashboard() {
        try {
            const payload = await requestApi('dashboard');
            dashboardSummary = payload.summary;
            const metrics = payload.summary?.metrics ?? {};
            document.querySelectorAll('[data-metric]').forEach((item) => {
                const key = item.dataset.metric;
                item.textContent = key === 'subscription_revenue_php'
                    ? formatMoney(metrics[key])
                    : formatCount(metrics[key]);
            });

            renderMonthly(payload.summary?.monthly ?? []);
            renderTopPlants(payload.summary?.top_plants ?? []);
            const unavailable = payload.summary?.monthly_active_users;
            const unavailableNote = document.querySelector('[data-mau-unavailable]');
            if (unavailableNote && unavailable?.available === false) {
                unavailableNote.hidden = false;
                unavailableNote.textContent = unavailable.reason;
            }
            setFeedback('Dashboard metrics are from the existing Supabase records.');
        } catch (error) {
            setFeedback(error.message, true);
            document.querySelectorAll('[data-metric]').forEach((item) => {
                item.textContent = 'Unavailable';
            });
            emptyRow(document.querySelector('[data-monthly-rows]'), 4, 'Monthly data is unavailable.');
            document.querySelector('[data-top-plants]')?.replaceChildren(
                createElement('p', 'empty-state', error.message)
            );
        }
    }

    function renderMonthly(months) {
        const tbody = document.querySelector('[data-monthly-rows]');
        if (!tbody) return;
        if (!Array.isArray(months) || months.length === 0) {
            emptyRow(tbody, 4, 'No monthly records are available.');
            return;
        }
        tbody.replaceChildren(...months.map((month) => {
            const row = document.createElement('tr');
            row.append(
                cell(month.month),
                cell(formatCount(month.new_users)),
                cell(formatCount(month.plant_scans)),
                cell(formatMoney(month.revenue_php))
            );
            return row;
        }));

        const canvas = document.getElementById('activity-chart');
        if (!canvas || !window.Chart) return;
        new Chart(canvas, {
            type: 'line',
            data: {
                labels: months.map((item) => item.month),
                datasets: [
                    {
                        label: 'Plant scans',
                        data: months.map((item) => Number(item.plant_scans) || 0),
                        borderColor: '#087A61',
                        backgroundColor: 'rgba(8, 122, 97, .08)',
                        borderWidth: 2,
                        pointRadius: 2,
                        tension: .35,
                        fill: true,
                    },
                    {
                        label: 'New users',
                        data: months.map((item) => Number(item.new_users) || 0),
                        borderColor: '#A9CBA5',
                        borderWidth: 2,
                        pointRadius: 2,
                        borderDash: [4, 4],
                        tension: .35,
                    },
                ],
            },
            options: {
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                },
            },
        });
    }

    function renderTopPlants(plants) {
        const container = document.querySelector('[data-top-plants]');
        if (!container) return;
        if (!Array.isArray(plants) || plants.length === 0) {
            container.replaceChildren(createElement('p', 'empty-state', 'No completed plant identifications yet.'));
            return;
        }
        container.replaceChildren(...plants.map((plant) => {
            const row = createElement('div', 'plant-row');
            const info = createElement('div', 'plant-info');
            info.append(
                createElement('strong', '', plant.scientific_name ?? 'Unspecified plant'),
                createElement('span', '', `${formatCount(plant.identifications)} identifications`)
            );
            row.append(info);
            return row;
        }));
    }

    function renderUsers(result) {
        const users = result?.users ?? [];
        const total = Number(result?.total) || 0;
        setRows(users, 7, (user) => {
            const row = document.createElement('tr');
            const identity = createElement('div', 'user-cell');
            identity.append(
                createElement('span', 'user-avatar mint', String(user.display_name || user.email || '?').slice(0, 1).toUpperCase()),
                createElement('strong', '', user.display_name || '—')
            );
            const identityCell = document.createElement('td');
            identityCell.append(identity);
            row.append(
                identityCell,
                cell(user.email),
                cell(formatDate(user.created_at)),
                cell(user.email_verified ? 'Verified' : 'Unverified'),
                cell(user.subscription_product_id ?? 'Free'),
                statusBadge(user.account_status)
            );
            const actionCell = document.createElement('td');
            if (role !== 'moderator' && !user.admin_role) {
                const button = createElement(
                    'button',
                    'secondary-button compact-button',
                    user.account_status === 'suspended' ? 'Reactivate' : 'Suspend'
                );
                button.type = 'button';
                button.addEventListener('click', () => changeUserStatus(user));
                actionCell.append(button);
            } else {
                actionCell.textContent = user.admin_role
                    ? `${user.admin_role.replaceAll('_', ' ')} account`
                    : 'View only';
            }
            row.append(actionCell);
            return row;
        });
        const pageLabel = document.querySelector('[data-page-label]');
        if (pageLabel) {
            pageLabel.textContent = total === 0
                ? '0 users'
                : `${userOffset + 1}–${Math.min(userOffset + users.length, total)} of ${total}`;
        }
        const previous = document.querySelector('[data-page-prev]');
        const next = document.querySelector('[data-page-next]');
        if (previous) previous.disabled = userOffset === 0;
        if (next) next.disabled = userOffset + users.length >= total;
    }

    async function loadUsers() {
        const search = document.querySelector('[data-module-search]')?.value.trim() ?? '';
        try {
            const payload = await requestApi('users.list', {
                data: { search, limit: 25, offset: userOffset },
            });
            renderUsers(payload.result);
            setFeedback('User records are read from Supabase Auth and profiles.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 7, error.message);
        }
    }

    async function changeUserStatus(user) {
        const nextStatus = user.account_status === 'suspended' ? 'active' : 'suspended';
        const verb = nextStatus === 'suspended' ? 'suspend' : 'reactivate';
        if (!window.confirm(`Are you sure you want to ${verb} this account? User records will be preserved.`)) {
            return;
        }
        try {
            await requestApi('users.status', {
                method: 'POST',
                data: { user_id: user.id, status: nextStatus },
            });
            showToast(`Account ${nextStatus === 'active' ? 'reactivated' : 'suspended'}; user data was preserved.`);
            await loadUsers();
        } catch (error) {
            showToast(error.message);
        }
    }

    function firstPlantSuggestion(result) {
        if (!result || typeof result !== 'object') return null;
        const suggestion =
            result.classification?.suggestions?.[0] ??
            result.result?.classification?.suggestions?.[0] ??
            result.matches?.[0];
        return suggestion && typeof suggestion === 'object' ? suggestion : null;
    }

    function suggestedName(result, isHealth) {
        if (!result || typeof result !== 'object') return '—';
        if (isHealth) {
            return result.diagnosis ?? result.condition ?? result.health_status ?? 'Assessment result';
        }
        const suggestion = firstPlantSuggestion(result);
        const commonNames = suggestion?.details?.common_names ?? suggestion?.common_names;
        return suggestion?.details?.scientific_name ??
            suggestion?.scientific_name ??
            suggestion?.name ??
            (Array.isArray(commonNames) ? commonNames[0] : null) ??
            'No plant match';
    }

    function matchProbability(result) {
        const suggestion = firstPlantSuggestion(result);
        const probability = suggestion?.probability ?? suggestion?.score;
        if (
            typeof probability !== 'number' ||
            !Number.isFinite(probability) ||
            probability < 0 ||
            probability > 1
        ) {
            return null;
        }
        return probability;
    }

    function matchConfidence(result) {
        const probability = matchProbability(result);
        if (probability === null) return '—';
        return `${(probability * 100).toFixed(1)}%`;
    }

    function matchStatus(result) {
        const probability = matchProbability(result);
        if (probability === null) return '—';
        return probability >= MATCH_CONFIDENCE_THRESHOLD ? 'Match' : 'Low confidence';
    }

    function addImage(cellElement, src) {
        if (typeof src !== 'string' || !src.startsWith('https://')) {
            cellElement.textContent = 'No image';
            return;
        }
        const image = document.createElement('img');
        image.src = src;
        image.alt = 'Private user-uploaded plant image';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.className = 'record-thumbnail';
        cellElement.append(image);
    }

    async function loadPlantRecords(action, isHealth) {
        try {
            const payload = await requestApi(action);
            const records = payload.records ?? [];
            const columnCount = isHealth ? 6 : 8;
            setRows(records, columnCount, (record) => {
                const row = document.createElement('tr');
                const imageCell = document.createElement('td');
                addImage(imageCell, record.image_url);
                const profileName = record.profile?.display_name || record.owner_id;
                row.append(
                    imageCell,
                    cell(profileName),
                    cell(suggestedName(record.result, isHealth))
                );
                if (!isHealth) {
                    row.append(
                        cell(matchConfidence(record.result)),
                        cell(matchStatus(record.result))
                    );
                }
                row.append(
                    cell(record.provider),
                    statusBadge(record.status),
                    cell(formatDate(record.created_at))
                );
                return row;
            });
            setFeedback(isHealth
                ? 'AI health assessments are informational, not verified diagnoses.'
                : `Match confidence of ${MATCH_CONFIDENCE_THRESHOLD * 100}% or higher is labeled Match; lower scores are Low confidence. This score is not a guarantee of correct identification.`);
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), isHealth ? 6 : 8, error.message);
        }
    }

    async function loadGarden() {
        try {
            const payload = await requestApi('garden.list');
            setRows(payload.plants, 4, (plant) => {
                const row = document.createElement('tr');
                row.append(
                    cell(plant.common_name),
                    cell(plant.scientific_name),
                    cell(plant.owner_id),
                    cell(formatDate(plant.created_at))
                );
                return row;
            });
            setFeedback('User garden data is displayed read-only.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 4, error.message);
        }
    }

    async function loadPlantLibrary(search = '') {
        try {
            const payload = await requestApi('plant_catalog.list', {
                data: search ? { search } : {},
            });
            renderPlantLibrary(payload.plants ?? payload.records ?? []);
            setFeedback(search
                ? `Plant library search results for “${search}”.`
                : 'Plant library records are ready to view or edit.');
        } catch (error) {
            setFeedback(error.message, true);
            const records = document.querySelector('[data-plant-records]');
            if (records) emptyRow(records, 8, error.message);
        }
    }

    function renderPlantLibrary(plants) {
        const records = document.querySelector('[data-plant-records]');
        if (!records) return;
        if (!Array.isArray(plants) || plants.length === 0) {
            emptyRow(records, 8, 'No matching plants.');
            return;
        }
        records.replaceChildren(...plants.map((plant) => {
            const row = document.createElement('tr');
            const imageCell = document.createElement('td');
            addImage(imageCell, plant.image_url);
            const referencesCell = document.createElement('td');
            renderPlantReferences(referencesCell, plant.field_references, plant.reference);
            const actionCell = document.createElement('td');
            const editButton = createElement('button', 'secondary-button compact-button', 'Edit');
            editButton.type = 'button';
            editButton.addEventListener('click', () => showPlantForm(plant));
            actionCell.append(editButton);
            row.append(
                imageCell,
                cell(plant.common_name),
                cell(plant.scientific_name),
                cell(plant.tagalog_name),
                cell(plant.bisaya_name),
                referencesCell,
                cell(formatDate(plant.date_updated ?? plant.updated_at)),
                actionCell
            );
            return row;
        }));
    }

    function showPlantForm(plant = null) {
        const form = moduleContent.querySelector('[data-plant-form]');
        if (!form) return;
        form.reset();
        form.hidden = false;
        form.dataset.plantId = plant?.id ?? '';
        syncPlantReferenceRequirements(form);
        moduleContent.querySelector('[data-plant-form-title]').textContent = plant
            ? `Edit ${plant.common_name ?? 'plant'}`
            : 'Add plant';
        for (const [name, value] of Object.entries(plant ?? {})) {
            const field = form.elements.namedItem(name);
            if (field && typeof value === 'string') field.value = value;
        }
        for (const [name, references] of Object.entries(plant?.field_references ?? {})) {
            const field = form.querySelector(`[data-plant-reference-for="${name}"]`);
            if (field) {
                field.value = Array.isArray(references)
                    ? references.filter((item) => typeof item === 'string').join('\n')
                    : typeof references === 'string' ? references : '';
            }
        }
        const dateField = form.elements.namedItem('date_updated');
        dateField.value = plant?.date_updated ?? plant?.updated_at?.slice(0, 10) ?? localDateValue();
        syncPlantReferenceRequirements(form);
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        form.elements.namedItem('common_name').focus();
    }

    function initializePlantReferences(form) {
        form.querySelectorAll('[data-plant-fact]').forEach((field) => {
            const factName = field.dataset.plantFact;
            const label = document.createElement('label');
            label.className = 'plant-reference-field';
            label.htmlFor = `plant-reference-${factName}`;
            label.textContent = `Reference(s) for ${plantFactLabels[factName]}`;
            const references = document.createElement('textarea');
            references.className = 'plant-reference-input';
            references.name = `${factName}_references_input`;
            references.id = label.htmlFor;
            references.dataset.plantReferenceFor = factName;
            references.rows = 2;
            references.maxLength = 4000;
            references.placeholder = 'Enter one source per line';
            label.append(references);
            label.classList.toggle('plant-form-wide', field.closest('label').classList.contains('plant-form-wide'));
            field.closest('label').after(label);
        });
        syncPlantReferenceRequirements(form);
    }

    function syncPlantReferenceRequirements(form) {
        form.querySelectorAll('[data-plant-fact]').forEach((field) => {
            const references = form.querySelector(`[data-plant-reference-for="${field.dataset.plantFact}"]`);
            if (!references) return;
            const hasValue = field.name === 'toxicity'
                ? field.value !== 'unknown'
                : field.value.trim() !== '';
            references.required = field.required || hasValue;
        });
    }

    function renderPlantReferences(cell, fieldReferences, legacyReference) {
        const entries = fieldReferences && typeof fieldReferences === 'object'
            ? Object.entries(fieldReferences)
            : [];
        const renderedEntries = entries.filter(([, references]) =>
            (Array.isArray(references) && references.length > 0) ||
            (typeof references === 'string' && references.trim() !== '')
        );
        if (renderedEntries.length === 0) {
            cell.textContent = typeof legacyReference === 'string' && legacyReference.trim()
                ? `Legacy record reference: ${legacyReference}`
                : '—';
            return;
        }
        renderedEntries.forEach(([fieldName, references]) => {
            const sources = Array.isArray(references)
                ? references.filter((item) => typeof item === 'string' && item.trim())
                : [references];
            const entry = createElement('div', 'plant-reference-entry');
            entry.append(
                createElement('strong', '', `${plantFactLabels[fieldName] ?? fieldName}: `),
                document.createTextNode(sources.join('; '))
            );
            cell.append(entry);
        });
    }

    async function savePlant(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());
        for (const [key, value] of Object.entries(values)) {
            values[key] = String(value).trim();
        }
        const fieldReferences = {};
        for (const field of form.querySelectorAll('[data-plant-fact]')) {
            const referencesInput = form.querySelector(
                `[data-plant-reference-for="${field.dataset.plantFact}"]`
            );
            const references = referencesInput.value
                .split(/\r?\n/)
                .map((reference) => reference.trim())
                .filter(Boolean);
            const hasValue = field.name === 'toxicity'
                ? field.value !== 'unknown'
                : field.value.trim() !== '';
            delete values[referencesInput.name];
            if (!hasValue) continue;
            if (references.length === 0) {
                showToast(`${errorMessage('plant_reference_required')} Missing source for ${plantFactLabels[field.dataset.plantFact]}.`);
                referencesInput.focus();
                return;
            }
            fieldReferences[field.name] = references;
        }
        values.field_references = fieldReferences;

        const isEdit = form.dataset.plantId !== '';
        const action = isEdit ? 'plant_catalog.update' : 'plant_catalog.create';
        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;
        try {
            await requestApi(action, {
                data: {
                    ...values,
                    ...(isEdit ? { id: form.dataset.plantId } : {}),
                },
            });
            form.reset();
            form.hidden = true;
            showToast(isEdit ? 'Plant information updated.' : 'Plant added to the library.');
            await loadPlantLibrary(moduleContent.querySelector('[data-plant-search]').value.trim());
        } catch (error) {
            showToast(error.message);
        } finally {
            submitButton.disabled = false;
        }
    }

    function localDateValue(date = new Date()) {
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 10);
    }

    async function loadSubscriptions() {
        try {
            const payload = await requestApi('subscriptions.list');
            const rows = payload.subscriptions.map((subscription) => ({
                user: subscription.user_id,
                product: subscription.product_id,
                status: subscription.status,
                expiresAt: subscription.expires_at,
                updatedAt: subscription.updated_at,
            }));
            const renderRow = (subscription) => {
                const row = document.createElement('tr');
                row.append(
                    cell(subscription.user),
                    cell(subscription.product),
                    statusBadge(subscription.status),
                    cell(formatDate(subscription.expiresAt)),
                    cell(formatDate(subscription.updatedAt))
                );
                return row;
            };

            if (role === 'admin') {
                try {
                    const paymentPayload = await requestApi('payments.list');
                    paymentPayload.payments
                        .filter((payment) => payment.payment_status === 'under_review')
                        .forEach((payment) => {
                            const plan = Array.isArray(payment.payment_plans)
                                ? payment.payment_plans[0]
                                : payment.payment_plans;
                            rows.push({
                                user: payment.profile?.display_name
                                    || payment.customer_full_name
                                    || payment.customer_email
                                    || payment.user_id,
                                product: plan?.name ?? plan?.product_id ?? 'Premium plan',
                                status: 'under_review',
                                expiresAt: null,
                                updatedAt: payment.updated_at ?? payment.created_at,
                            });
                        });
                } catch (error) {
                    setRows(rows, 5, renderRow);
                    setFeedback(`Subscriptions loaded, but payment review status could not be loaded: ${error.message}`, true);
                    return;
                }
            }

            setRows(rows, 5, renderRow);
            setFeedback(role === 'admin'
                ? 'Pending manual payment reviews appear here but are not active Premium entitlements. Admins must confirm receipt in Payment Management to activate Premium.'
                : 'Entitlements are read-only; client submissions cannot grant Premium.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 5, error.message);
        }
    }

    async function loadPayments() {
        try {
            const payload = await requestApi('payments.list');
            setRows(payload.payments, 8, (payment) => {
                const row = document.createElement('tr');
                const plan = Array.isArray(payment.payment_plans)
                    ? payment.payment_plans[0]
                    : payment.payment_plans;
                const user = payment.profile?.display_name || payment.customer_full_name || payment.customer_email || payment.user_id;
                row.append(
                    cell(payment.id),
                    cell(user),
                    cell(`${plan?.name ?? 'Plan'} · ${formatMoney(Number(payment.amount_centavos) / 100)}`),
                    cell(payment.merchant_transaction_reference),
                );
                const receiptCell = document.createElement('td');
                if (payment.receipt_url) {
                    const link = createElement('a', 'text-link', 'View receipt');
                    link.href = payment.receipt_url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    receiptCell.append(link);
                } else {
                    receiptCell.textContent = 'No receipt';
                }
                row.append(receiptCell, cell(payment.ocr_status ?? '—'), statusBadge(payment.payment_status));
                const actionCell = document.createElement('td');
                if (payment.payment_status === 'under_review' && role === 'admin') {
                    actionCell.append(
                        reviewButton(payment, 'approve'),
                        reviewButton(payment, 'reject')
                    );
                } else {
                    actionCell.textContent = payment.payment_status === 'under_review'
                        ? 'Awaiting Admin'
                        : '—';
                }
                row.append(actionCell);
                return row;
            });
            setFeedback('Admin payment reviews are audited.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 8, error.message);
        }
    }

    function reviewButton(payment, decision) {
        const approve = decision === 'approve';
        const button = createElement('button', 'secondary-button compact-button', approve ? 'Approve' : 'Reject');
        button.type = 'button';
        button.addEventListener('click', async () => {
            let notes = '';
            if (approve) {
                if (!window.confirm('Only continue if you checked the official GCash merchant records and confirm the transaction was received. Approve this payment?')) {
                    return;
                }
            } else {
                notes = window.prompt('Enter a reason for rejecting this payment:', '')?.trim() ?? '';
                if (!notes) {
                    showToast('A rejection reason is required.');
                    return;
                }
            }
            try {
                const result = await requestApi('payments.review', {
                    method: 'POST',
                    data: {
                        payment_request_id: payment.id,
                        decision,
                        confirm_received: approve,
                        review_notes: notes,
                    },
                });
                const deliveryStatus = result.notification?.status ?? 'unknown';
                if (!approve) {
                    showToast(`Payment rejected. Customer email status: ${deliveryStatus}.`);
                } else if (deliveryStatus === 'sent') {
                    showToast("Payment approved. The customer's Premium access has been upgraded, and confirmation email was sent.");
                } else if (deliveryStatus === 'failed') {
                    showToast("Payment approved. The customer's Premium access has been upgraded, but the confirmation email could not be sent. Check email delivery configuration.");
                } else if (deliveryStatus === 'not_configured') {
                    showToast("Payment approved. The customer's Premium access has been upgraded, but customer confirmation email is not configured.");
                } else if (deliveryStatus === 'processing') {
                    showToast("Payment approved. The customer's Premium access has been upgraded. Confirmation email is still processing.");
                } else {
                    showToast("Payment approved. The customer's Premium access has been upgraded, but email delivery could not be confirmed.");
                }
                await loadPayments();
            } catch (error) {
                showToast(error.message);
            }
        });
        return button;
    }

    async function loadAnnouncements() {
        try {
            const payload = await requestApi('announcements.list');
            setRows(payload.announcements, 5, (announcement) => {
                const row = document.createElement('tr');
                row.append(
                    cell(announcement.title),
                    cell(announcement.category),
                    cell(formatDate(announcement.published_at)),
                    cell(formatDate(announcement.expires_at)),
                    cell(announcementVisibility(announcement))
                );
                return row;
            });
            setFeedback('Expired announcements are hidden from the app feed but retained in this admin history.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 5, error.message);
        }
    }

    async function loadAdmins() {
        try {
            const payload = await requestApi('roles.list');
            setRows(payload.administrators, 5, (administrator) => {
                const row = document.createElement('tr');
                row.append(
                    cell(administrator.email),
                    cell(administrator.user_id),
                    cell(administrator.role.replaceAll('_', ' ')),
                    statusBadge(administrator.status),
                    cell(formatDate(administrator.created_at))
                );
                return row;
            });
            setFeedback('The Admin can manage moderator roles. The single active Admin account is protected.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 5, error.message);
        }
    }

    async function exportDashboard() {
        try {
            dashboardSummary ??= (await requestApi('dashboard')).summary;
            const metrics = dashboardSummary.metrics ?? {};
            const rows = [
                ['Metric', 'Value'],
                ...Object.entries(metrics),
                [],
                ['Month', 'New users', 'Plant scans', 'Approved revenue PHP'],
                ...(dashboardSummary.monthly ?? []).map((item) => [
                    item.month,
                    item.new_users,
                    item.plant_scans,
                    item.revenue_php,
                ]),
            ];
            const csv = rows.map((row) => row.map(csvValue).join(',')).join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = createElement('a');
            link.href = url;
            link.download = 'luminhaw-dashboard-metrics.csv';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            showToast(error.message);
        }
    }

    function csvValue(value) {
        const text = value === null || value === undefined ? '' : String(value);
        return `"${text.replaceAll('"', '""')}"`;
    }

    authReady = initializeAuth();
})();
