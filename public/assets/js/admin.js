(() => {
    const body = document.body;
    const moduleName = body.dataset.module;
    const role = body.dataset.role;
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
    const toast = document.querySelector('[data-toast]');
    const feedback = document.querySelector('[data-feedback]');
    const moduleNote = document.querySelector('[data-module-note]');
    const menuToggle = document.querySelector('[data-menu-toggle]');
    const scrim = document.querySelector('[data-close-menu]');
    const logoutForm = document.querySelector('[data-logout-form]');
    let toastTimer;
    let dashboardSummary = null;
    let userOffset = 0;
    let userSearchTimer;

    const closeMenu = () => {
        body.classList.remove('menu-open');
        menuToggle?.setAttribute('aria-expanded', 'false');
    };

    menuToggle?.addEventListener('click', () => {
        const isOpen = body.classList.toggle('menu-open');
        menuToggle.setAttribute('aria-expanded', String(isOpen));
    });
    scrim?.addEventListener('click', closeMenu);
    logoutForm?.addEventListener('submit', (event) => {
        if (!window.confirm('Are you sure you want to sign out?')) {
            event.preventDefault();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });

    async function requestApi(action, options = {}) {
        const method = options.method ?? 'GET';
        const url = new URL('api.php', window.location.href);
        const requestOptions = {
            method,
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        };
        if (method === 'GET') {
            url.searchParams.set('action', action);
            Object.entries(options.data ?? {}).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    url.searchParams.set(key, String(value));
                }
            });
        } else {
            requestOptions.headers['Content-Type'] = 'application/json';
            requestOptions.headers['X-CSRF-Token'] = csrfToken;
            requestOptions.body = JSON.stringify({ action, ...(options.data ?? {}) });
        }

        const response = await fetch(url, requestOptions);
        let payload;
        try {
            payload = await response.json();
        } catch {
            throw new Error('The server returned an invalid response.');
        }
        if (response.status === 401 || response.status === 403) {
            window.location.assign('login.php');
            throw new Error('Your administrator session is no longer active.');
        }
        if (!response.ok || payload.error) {
            const code = payload.error?.code ?? 'request_failed';
            throw new Error(errorMessage(code));
        }
        return payload;
    }

    function errorMessage(code) {
        const messages = {
            dashboard_data_unavailable: 'Live dashboard data is unavailable. Check that the admin migration is applied.',
            user_records_unavailable: 'User records could not be loaded.',
            user_status_update_failed: 'The account status was not changed.',
            plant_catalog_unavailable: 'Plant catalog data could not be loaded.',
            plant_details_unavailable: 'Plant care or image details could not be loaded.',
            payment_records_unavailable: 'Payment records could not be loaded.',
            payment_review_failed: 'The payment review was not completed.',
            private_receipt_unavailable: 'A private receipt could not be opened safely.',
            announcement_create_failed: 'The announcement was not saved.',
            admin_role_assignment_failed: 'The administrator role was not changed. Check the target account and final Super Admin protection.',
            garden_records_unavailable: 'Garden records could not be loaded.',
            subscription_records_unavailable: 'Subscription records could not be loaded.',
            announcements_unavailable: 'Announcements could not be loaded.',
            insufficient_role: 'Your administrator role cannot perform this action.',
            invalid_payment_review: 'Confirm the transaction or provide a rejection reason.',
            administrator_access_required: 'An active administrator role is required.',
        };
        return messages[code] ?? `Request failed (${code}).`;
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
                        borderColor: '#07583e',
                        backgroundColor: 'rgba(7, 88, 62, .08)',
                        borderWidth: 2,
                        pointRadius: 2,
                        tension: .35,
                        fill: true,
                    },
                    {
                        label: 'New users',
                        data: months.map((item) => Number(item.new_users) || 0),
                        borderColor: '#82ae8c',
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

    async function loadPlants() {
        const search = document.querySelector('[data-module-search]')?.value.trim() ?? '';
        try {
            const payload = await requestApi('plants.list', { data: { search, limit: 50 } });
            setRows(payload.plants, 5, (plant) => {
                const row = document.createElement('tr');
                row.append(
                    cell(plant.scientific_name),
                    cell(plant.common_name),
                    cell(plant.family),
                    cell(plant.care?.reviewed ? 'Reviewed' : 'Unreviewed'),
                    cell(plant.description_source ?? plant.care?.source_url)
                );
                return row;
            });
            setFeedback('Catalog records and source metadata are read-only in this view.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 5, error.message);
        }
    }

    function suggestedName(result, isHealth) {
        if (!result || typeof result !== 'object') return '—';
        if (isHealth) {
            return result.diagnosis ?? result.condition ?? result.health_status ?? 'Assessment result';
        }
        const suggestion = result.classification?.suggestions?.[0];
        return suggestion?.details?.scientific_name ?? suggestion?.name ?? 'No plant match';
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
            setRows(records, 6, (record) => {
                const row = document.createElement('tr');
                const imageCell = document.createElement('td');
                addImage(imageCell, record.image_url);
                const profileName = record.profile?.display_name || record.owner_id;
                row.append(
                    imageCell,
                    cell(profileName),
                    cell(suggestedName(record.result, isHealth)),
                    cell(record.provider),
                    statusBadge(record.status),
                    cell(formatDate(record.created_at))
                );
                return row;
            });
            setFeedback(isHealth
                ? 'AI health assessments are informational, not verified diagnoses.'
                : 'Original identification results are shown without modification.');
        } catch (error) {
            setFeedback(error.message, true);
            emptyRow(document.querySelector('[data-records]'), 6, error.message);
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

    async function loadSubscriptions() {
        try {
            const payload = await requestApi('subscriptions.list');
            setRows(payload.subscriptions, 5, (subscription) => {
                const row = document.createElement('tr');
                row.append(
                    cell(subscription.user_id),
                    cell(subscription.product_id),
                    statusBadge(subscription.status),
                    cell(formatDate(subscription.expires_at)),
                    cell(formatDate(subscription.updated_at))
                );
                return row;
            });
            setFeedback('Entitlements are read-only; client submissions cannot grant Premium.');
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
                if (payment.payment_status === 'under_review' && role === 'super_admin') {
                    actionCell.append(
                        reviewButton(payment, 'approve'),
                        reviewButton(payment, 'reject')
                    );
                } else {
                    actionCell.textContent = payment.payment_status === 'under_review'
                        ? 'Awaiting Super Admin'
                        : '—';
                }
                row.append(actionCell);
                return row;
            });
            setFeedback('Review actions require a Super Admin and are audited. Email-token review remains available.');
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
                const decisionLabel = approve ? 'approved' : 'rejected';
                showToast(
                    `Payment ${decisionLabel}. Customer email status: ${deliveryStatus}.`
                );
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
                    cell(announcement.is_active ? 'Yes' : 'No')
                );
                return row;
            });
            setFeedback('Announcements are stored in the shared app feed; no push delivery is configured.');
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
            setFeedback('Only a Super Admin can assign roles; the final active Super Admin is protected.');
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

    document.querySelectorAll('[data-export-dashboard]').forEach((button) => {
        button.addEventListener('click', exportDashboard);
    });

    const userSearch = document.querySelector('[data-module-search]');
    if (moduleName === 'users' || moduleName === 'plants') {
        userSearch?.addEventListener('input', () => {
            window.clearTimeout(userSearchTimer);
            userSearchTimer = window.setTimeout(() => {
                if (moduleName === 'users') {
                    userOffset = 0;
                    loadUsers();
                } else {
                    loadPlants();
                }
            }, 250);
        });
    }
    document.querySelector('[data-page-prev]')?.addEventListener('click', () => {
        userOffset = Math.max(0, userOffset - 25);
        loadUsers();
    });
    document.querySelector('[data-page-next]')?.addEventListener('click', () => {
        userOffset += 25;
        loadUsers();
    });

    document.querySelector('[data-announcement-form]')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        try {
            await requestApi('announcements.create', {
                method: 'POST',
                data: Object.fromEntries(formData.entries()),
            });
            event.currentTarget.reset();
            showToast('Announcement published to the LUMINHAW app feed. Push delivery was not performed.');
            await loadAnnouncements();
        } catch (error) {
            showToast(error.message);
        }
    });

    document.querySelector('[data-role-form]')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        try {
            await requestApi('roles.set', {
                method: 'POST',
                data: Object.fromEntries(formData.entries()),
            });
            event.currentTarget.reset();
            showToast('Administrator role saved.');
            await loadAdmins();
        } catch (error) {
            showToast(error.message);
        }
    });

    switch (moduleName) {
        case 'dashboard':
        case 'reports':
            loadDashboard();
            break;
        case 'users':
            loadUsers();
            break;
        case 'plants':
            loadPlants();
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
})();
