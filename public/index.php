<?php

require_once dirname(__DIR__) . '/app/Helpers/bootstrap.php';
require_once dirname(__DIR__) . '/app/Helpers/http.php';

try {
    $admin = $adminAuth->currentAdmin();
} catch (AdminAccessException $error) {
    if ($error->httpStatus === 401 || $error->httpStatus === 403) {
        redirect('login.php');
    }
    http_response_code($error->httpStatus);
    exit(e($error->getMessage()));
} catch (SupabaseException $error) {
    error_log('Admin page authentication failed: ' . $error->errorCode);
    http_response_code(503);
    exit('Administrator sign-in is temporarily unavailable.');
}

$module = (string) ($_GET['module'] ?? 'dashboard');
$titles = [
    'dashboard' => 'Dashboard',
    'users' => 'User Management',
    'scans' => 'AI Plant Identification',
    'health' => 'Plant Health Monitoring',
    'garden' => 'Garden Management',
    'plants' => 'Plant Library',
    'subscriptions' => 'Premium Subscriptions',
    'payments' => 'Payment Management',
    'announcements' => 'Announcements',
    'reports' => 'Reports & Analytics',
    'admins' => 'Admin Management',
    'settings' => 'System Settings',
];
if (!isset($titles[$module])) {
    http_response_code(404);
    exit('Page not found.');
}

$role = $admin['role'];
$visibleModules = match ($role) {
    'admin' => array_keys($titles),
    default => ['dashboard', 'scans', 'health', 'reports'],
};
if (!in_array($module, $visibleModules, true)) {
    http_response_code(403);
    exit('Your administrator role cannot access this page.');
}

$navigation = [
    'dashboard' => 'Dashboard',
    'users' => 'User Management',
    'scans' => 'AI Plant Identification',
    'health' => 'Plant Health Monitoring',
    'garden' => 'Garden Management',
    'plants' => 'Plant Library',
    'subscriptions' => 'Premium Subscriptions',
    'payments' => 'Payment Management',
    'announcements' => 'Announcements',
    'reports' => 'Reports & Analytics',
    'admins' => 'Admin Management',
    'settings' => 'System Settings',
];
$navigationIcons = [
    'dashboard' => 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
    'users' => 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    'scans' => 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M8 12h8 M12 8v8',
    'health' => 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z M3 12h4l2-3 3 6 2-3h7',
    'garden' => 'M12 22v-8 M12 14c-4 0-7-2-7-6 4 0 7 2 7 6z M12 11c0-4 3-7 7-7 0 4-3 7-7 7z',
    'plants' => 'M20 4c-8 0-14 3-14 9a5 5 0 0 0 5 5c6 0 9-6 9-14ZM4 21c3-5 6-8 11-11',
    'subscriptions' => 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z',
    'payments' => 'M3 6h18v12H3z M3 10h18 M7 15h3',
    'announcements' => 'M3 11v2a2 2 0 0 0 2 2h2l9 5V4l-9 5H5a2 2 0 0 0-2 2z M7 15l2 6h4l-3-5 M18 9a4 4 0 0 1 0 6',
    'reports' => 'M3 3v18h18 M8 16v-4 M13 16V8 M18 16v-7',
    'admins' => 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z M9 12l2 2 4-4',
    'settings' => 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.2l-.1-.2a1.7 1.7 0 0 0-1.5-1 1.7 1.7 0 0 0-1.5 1l-.1.2H6.4l-.1-.1a1.7 1.7 0 0 0-1.9-.3l-.2.1-1.6-2.8.1-.1A1.7 1.7 0 0 0 3 15l-.1-.2v-3.2L3 11.5a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.6-2.8.2.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3.2l.1.2a1.7 1.7 0 0 0 1.5 1 1.7 1.7 0 0 0 1.5-1l.1-.2H16l.1.1a1.7 1.7 0 0 0 1.9.3l.2-.1 1.6 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.2v3.2z',
];
$csrfToken = $adminAuth->csrfToken();
$userEmail = is_string($admin['user']['email'] ?? null)
    ? $admin['user']['email']
    : 'Administrator';
$roleLabel = ucwords(str_replace('_', ' ', $role));
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#F6F8F1">
    <meta name="csrf-token" content="<?= e($csrfToken) ?>">
    <title><?= e($titles[$module]) ?> · LUMINHAW Admin</title>
    <link rel="stylesheet" href="assets/css/admin.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" defer></script>
    <script src="assets/js/admin.js" defer></script>
</head>
<body data-module="<?= e($module) ?>" data-role="<?= e($role) ?>">
<div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <a class="brand" href="?module=dashboard" aria-label="LUMINHAW Admin home">
            <span class="brand-mark"><img src="assets/icons/logo.png" alt=""></span>
            <span class="brand-copy"><strong>LUMINHAW</strong><small>ADMIN CONSOLE</small></span>
        </a>
        <div class="nav-caption">MANAGEMENT</div>
        <nav class="nav-list">
            <?php foreach ($navigation as $key => $label): ?>
                <?php if (in_array($key, $visibleModules, true)): ?>
                    <a class="nav-item<?= $module === $key ? ' active' : '' ?>"
                       href="?module=<?= e($key) ?>"
                       <?= $module === $key ? 'aria-current="page"' : '' ?>>
                        <span class="nav-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                                 stroke-linecap="round" stroke-linejoin="round">
                                <path d="<?= e($navigationIcons[$key]) ?>"></path>
                            </svg>
                        </span>
                        <span><?= e($label) ?></span>
                    </a>
                <?php endif; ?>
            <?php endforeach; ?>
        </nav>
        <div class="sidebar-bottom">
            <div class="sidebar-help">
                <strong>Protected workspace</strong>
                <p>Access is checked against your active Supabase administrator role.</p>
            </div>
            <div class="admin-profile">
                <div class="profile-avatar"><?= e(strtoupper(substr($userEmail, 0, 1))) ?></div>
                <div class="profile-copy">
                    <strong><?= e($userEmail) ?></strong>
                    <span><?= e($roleLabel) ?></span>
                </div>
            </div>
        </div>
    </aside>
    <div class="sidebar-scrim" data-close-menu></div>
    <main class="main-content">
        <header class="topbar">
            <button class="icon-button menu-toggle" type="button" aria-label="Open navigation"
                    aria-expanded="false" aria-controls="sidebar" data-menu-toggle>☰</button>
            <div class="breadcrumbs"><span>Management</span><span class="crumb-divider">/</span><strong><?= e($titles[$module]) ?></strong></div>
            <div class="topbar-actions">
                <span class="environment-pill"><span></span><?= e(getenv('APP_ENV') ?: 'local') ?></span>
                <div class="topbar-avatar" aria-label="<?= e($userEmail) ?>"><?= e(strtoupper(substr($userEmail, 0, 1))) ?></div>
                <form method="post" action="logout.php" data-logout-form>
                    <input type="hidden" name="csrf_token" value="<?= e($csrfToken) ?>">
                    <button class="icon-button sign-out-button" type="submit" aria-label="Sign out" title="Sign out">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M10 17l5-5-5-5 M15 12H3 M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"></path>
                        </svg>
                    </button>
                </form>
            </div>
        </header>
        <div class="page-content">
            <section class="welcome-row">
                <div>
                    <div class="eyebrow"><?= e(strtoupper(date('l, F j, Y'))) ?></div>
                    <h1><?= e($titles[$module]) ?></h1>
                    <p class="page-subtitle">LUMINHAW administration · <?= e($roleLabel) ?></p>
                </div>
            </section>

            <?php if ($module === 'dashboard'): ?>
                <div class="page-feedback" data-feedback role="status" aria-live="polite">Loading authorized dashboard data…</div>
                <section class="metrics-grid live-metrics" aria-label="Live key metrics" data-dashboard-metrics>
                    <?php
                    $metrics = [
                        ['total_users', 'Total registered users', 'mint', 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
                        ['active_users_30d', 'Active users · 30 days', 'blue', 'M12 8v4l3 2M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6'],
                        ['verified_users', 'Verified users', 'lilac', 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4'],
                        ['plant_scans', 'Plant scans', 'gold', 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8'],
                        ['identified_plants', 'Identified plant names', 'mint', 'M20 4c-8 0-14 3-14 9a5 5 0 0 0 5 5c6 0 9-6 9-14ZM4 21c3-5 6-8 11-11'],
                        ['garden_plants', 'Garden plants', 'blue', 'M12 12V5M12 10c-4 0-6-2-6-5 4 0 6 2 6 5ZM12 8c0-3 2-5 6-5 0 3-2 5-6 5ZM5 13h14l-2 8H7l-2-8Z'],
                        ['premium_subscribers', 'Active premium subscribers', 'lilac', 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z'],
                        ['pending_payments', 'Payments awaiting review', 'gold', 'M6 3h12M6 21h12M8 3c0 4 4 5 4 9s-4 5-4 9M16 3c0 4-4 5-4 9s4 5 4 9'],
                        ['approved_payments', 'Approved payments', 'mint', 'M5 4h14v16H5zM8 8h8M8 12h4M8 16l2 2 4-4'],
                        ['subscription_revenue_php', 'Recorded subscription revenue', 'blue', 'M4 7c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2ZM4 7v5c0 1.1 3.6 2 8 2M20 7v4M4 12v5c0 1.1 3.6 2 8 2M20 12v2M16 18h5M18.5 15.5v5'],
                    ];
                    foreach ($metrics as [$key, $label, $tone, $iconPath]):
                    ?>
                        <article class="metric-card">
                            <div class="metric-top">
                                <span class="metric-label"><?= e($label) ?></span>
                                <span class="metric-icon <?= e($tone) ?>" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                                         stroke-linecap="round" stroke-linejoin="round">
                                        <path d="<?= e($iconPath) ?>"></path>
                                    </svg>
                                </span>
                            </div>
                            <div class="metric-value" data-metric="<?= e($key) ?>">—</div>
                            <div class="metric-foot"><span>From Supabase records</span></div>
                        </article>
                    <?php endforeach; ?>
                </section>
                <section class="dashboard-grid">
                    <article class="panel chart-panel">
                        <div class="panel-heading">
                            <div><h2>Recent monthly activity</h2><p>New accounts, plant scans, and approved payment totals</p></div>
                        </div>
                        <div class="chart-legend">
                            <span><i class="legend-dot scans"></i> Plant scans</span>
                            <span><i class="legend-dot members"></i> New users</span>
                        </div>
                        <div class="chart-wrap"><canvas id="activity-chart" aria-label="Monthly Supabase activity chart" role="img"></canvas></div>
                    </article>
                    <article class="panel popular-panel">
                        <div class="panel-heading">
                            <div><h2>Most identified plants</h2><p>Completed scan results in Supabase</p></div>
                        </div>
                        <div class="plant-list" data-top-plants><p class="empty-state">Loading plant results…</p></div>
                        <p class="unavailable-note" data-mau-unavailable hidden></p>
                    </article>
                </section>
                <section class="panel activity-panel">
                    <div class="panel-heading">
                        <div><h2>Monthly metrics</h2><p>Aggregated from Auth users, identification records, and approved payments</p></div>
                    </div>
                    <div class="table-scroll">
                        <table>
                            <thead><tr><th>MONTH</th><th>NEW USERS</th><th>PLANT SCANS</th><th>APPROVED REVENUE</th></tr></thead>
                            <tbody data-monthly-rows><tr><td colspan="4">Loading…</td></tr></tbody>
                        </table>
                    </div>
                </section>
            <?php else: ?>
                <section class="panel module-panel"
                         data-module-panel="<?= e($module) ?>"
                         data-feedback-region>
                    <div class="module-toolbar">
                        <?php if ($module === 'users'): ?>
                            <label class="search-control">
                                <span class="sr-only">Search <?= e(strtolower($titles[$module])) ?></span>
                                <input type="search" data-module-search placeholder="Search <?= e(strtolower($titles[$module])) ?>">
                            </label>
                        <?php endif; ?>
                        <p class="module-note" data-module-note>Loading authorized records…</p>
                    </div>
                    <?php if ($module === 'users'): ?>
                        <div class="table-scroll"><table><thead><tr><th>USER</th><th>EMAIL</th><th>REGISTERED</th><th>VERIFIED</th><th>PLAN</th><th>ACCOUNT</th><th>ACTION</th></tr></thead><tbody data-records></tbody></table></div>
                        <div class="pagination-controls"><button type="button" data-page-prev>Previous</button><span data-page-label></span><button type="button" data-page-next>Next</button></div>
                    <?php elseif ($module === 'scans'): ?>
                        <div class="table-scroll"><table><thead><tr><th>IMAGE</th><th>USER</th><th>RESULT</th><th>MATCH CONFIDENCE</th><th>MATCH</th><th>PROVIDER</th><th>STATUS</th><th>DATE</th></tr></thead><tbody data-records></tbody></table></div>
                    <?php elseif ($module === 'health'): ?>
                        <div class="table-scroll"><table><thead><tr><th>IMAGE</th><th>USER</th><th>RESULT</th><th>PROVIDER</th><th>STATUS</th><th>DATE</th></tr></thead><tbody data-records></tbody></table></div>
                    <?php elseif ($module === 'garden'): ?>
                        <div class="table-scroll"><table><thead><tr><th>PLANT</th><th>SCIENTIFIC NAME</th><th>OWNER</th><th>ADDED</th></tr></thead><tbody data-records></tbody></table></div>
                    <?php elseif ($module === 'plants'): ?>
                        <div class="notice-banner">Only administrators can add or edit library records. A source reference is required for every save; there is no delete action.</div>
                        <div class="plant-library-toolbar">
                            <label class="search-control"><span class="sr-only">Search plants by common, scientific, Tagalog, or Bisaya name</span><input type="search" data-plant-search placeholder="Search common, scientific, Tagalog, or Bisaya name"></label>
                            <button class="primary-button" type="button" data-plant-add>Add plant</button>
                        </div>
                        <form class="plant-form" data-plant-form hidden>
                            <div class="plant-form-heading"><h2 data-plant-form-title>Add plant</h2><button class="secondary-button" type="button" data-plant-cancel>Cancel</button></div>
                            <label>Plant picture URL<input name="image_url" data-plant-fact="image_url" type="url" maxlength="2048" placeholder="https://…" autocomplete="url"></label>
                            <label>Common name (English)<input name="common_name" data-plant-fact="common_name" maxlength="160" required></label>
                            <label>Scientific name<input name="scientific_name" data-plant-fact="scientific_name" maxlength="200" required></label>
                            <label>Tagalog name<input name="tagalog_name" data-plant-fact="tagalog_name" maxlength="160"></label>
                            <label>Bisaya name<input name="bisaya_name" data-plant-fact="bisaya_name" maxlength="160"></label>
                            <label class="plant-form-wide">Plant description<textarea name="description" data-plant-fact="description" rows="3"></textarea></label>
                            <label>Water requirement<textarea name="water_requirement" data-plant-fact="water_requirement" rows="2"></textarea></label>
                            <label>Sunlight requirement<textarea name="sunlight_requirement" data-plant-fact="sunlight_requirement" rows="2"></textarea></label>
                            <label>Soil type<textarea name="soil_requirement" data-plant-fact="soil_requirement" rows="2"></textarea></label>
                            <label>Fertilizer recommendation<textarea name="fertilizer" data-plant-fact="fertilizer" rows="2"></textarea></label>
                            <label>Growth tips<textarea name="growth_tips" data-plant-fact="growth_tips" rows="2"></textarea></label>
                            <label>Common diseases<textarea name="common_diseases" data-plant-fact="common_diseases" rows="2"></textarea></label>
                            <label>Treatment<textarea name="treatment" data-plant-fact="treatment" rows="2"></textarea></label>
                            <label>Toxicity<select name="toxicity" data-plant-fact="toxicity"><option value="unknown">Unknown</option><option value="safe">Safe for pets and humans</option><option value="toxic_pets">Toxic to pets</option><option value="toxic_humans">Toxic to humans</option><option value="toxic_pets_humans">Toxic to pets and humans</option></select></label>
                            <label>Date updated<input name="date_updated" type="date" required></label>
                            <p class="module-note plant-form-wide">Every populated fact requires its own reference. Enter one source per line; a fact can have multiple references. If a source supports multiple facts, add it to each relevant fact.</p>
                            <button class="primary-button" type="submit">Save plant</button>
                        </form>
                        <div class="table-scroll"><table><thead><tr><th>PICTURE</th><th>COMMON NAME</th><th>SCIENTIFIC NAME</th><th>TAGALOG</th><th>BISAYA</th><th>FIELD REFERENCES</th><th>UPDATED</th><th>ACTION</th></tr></thead><tbody data-plant-records><tr><td colspan="8">Loading plant library…</td></tr></tbody></table></div>
                    <?php elseif ($module === 'subscriptions'): ?>
                        <div class="notice-banner">A payment awaiting manual review is not an active Premium subscription. The Admin verifies receipts in Payment Management; only confirmed payments activate Premium.</div>
                        <div class="table-scroll"><table><thead><tr><th>USER</th><th>PRODUCT</th><th>STATUS</th><th>EXPIRES</th><th>UPDATED</th></tr></thead><tbody data-records></tbody></table></div>
                    <?php elseif ($module === 'payments'): ?>
                        <div class="notice-banner">The Admin can review payments. Approve only after confirming the GCash transaction in authorized merchant records. The existing email-token review remains available.</div>
                        <div class="table-scroll"><table><thead><tr><th>PAYMENT</th><th>USER</th><th>PLAN / AMOUNT</th><th>REFERENCE</th><th>RECEIPT</th><th>OCR REVIEW</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody data-records></tbody></table></div>
                    <?php elseif ($module === 'announcements'): ?>
                        <form class="announcement-form" data-announcement-form>
                            <label>Title<input name="title" maxlength="120" required></label>
                            <label>Message<textarea name="body" maxlength="4000" rows="4" required></textarea></label>
                            <label>Type<select name="category"><option value="update">Update</option><option value="maintenance">Maintenance</option><option value="feature">Feature</option><option value="account">Account</option></select></label>
                            <label>Start date and time (local)<input name="published_at" type="datetime-local" required></label>
                            <label>Expiry date and time (local)<input name="expires_at" type="datetime-local" required></label>
                            <button class="primary-button" type="submit">Publish to app feed</button>
                            <p class="module-note">Announcements appear in the app feed during this time window. Expired announcements are hidden from users and retained here; no phone notification is sent.</p>
                        </form>
                        <div class="table-scroll"><table><thead><tr><th>TITLE</th><th>TYPE</th><th>STARTS</th><th>EXPIRES</th><th>VISIBILITY</th></tr></thead><tbody data-records></tbody></table></div>
                    <?php elseif ($module === 'admins'): ?>
                        <form class="role-form" data-role-form>
                            <label>Existing Auth user ID<input name="user_id" autocomplete="off" required placeholder="UUID of an existing account"></label>
                            <label>Role<select name="role"><option value="admin">Admin</option><option value="moderator">Moderator</option></select></label>
                            <label>Status<select name="status"><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
                            <button class="primary-button" type="submit">Save administrator role</button>
                            <p class="module-note">There is one active Admin account. It cannot be demoted or suspended, and another active Admin cannot be added.</p>
                        </form>
                        <div class="table-scroll"><table><thead><tr><th>ADMIN</th><th>USER ID</th><th>ROLE</th><th>STATUS</th><th>ASSIGNED</th></tr></thead><tbody data-records></tbody></table></div>
                    <?php elseif ($module === 'reports'): ?>
                        <div class="report-summary">
                            <p>Reports use real records returned by the dashboard API. Historical monthly active users are unavailable because the existing schema does not store activity snapshots.</p>
                            <button class="secondary-button" type="button" data-export-dashboard>Export available metrics as CSV</button>
                        </div>
                    <?php elseif ($module === 'settings'): ?>
                        <dl class="settings-list">
                            <div><dt>Authentication</dt><dd>Supabase Auth · verified administrator role required</dd></div>
                            <div><dt>Database access</dt><dd>Supabase Edge Function with server-only service credentials</dd></div>
                            <div><dt>Session policy</dt><dd>30-minute idle timeout · 8-hour maximum · secure HttpOnly cookie in production</dd></div>
                            <div><dt>Push delivery</dt><dd>Not configured by the existing announcement schema</dd></div>
                        </dl>
                    <?php endif; ?>
                </section>
            <?php endif; ?>
            <footer class="page-footer"><span>© <?= e(date('Y')) ?> LUMINHAW</span><span>Growing brighter, one plant at a time</span></footer>
        </div>
    </main>
</div>
<div class="toast" role="status" aria-live="polite" data-toast></div>
</body>
</html>
