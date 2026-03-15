/**
 * 会话与访问守卫
 * - 角色权限判定
 * - 页面前置链路校验
 * - 会话切换 UI（本地账号 + 工号）
 */

const AccessGuard = {
    PAGE_LABELS: {
        schedulePeriod: '排班周期管理',
        schedule: '排班展示',
        staff: '人员管理配置',
        request: '个性化休假配置',
        ruleConfig: '排班规则配置',
        dailyManpower: '排班配置管理',
        minimumManpower: '每日最低人力配置',
        nightShift: '大夜管理和配置',
        monthlySchedule: '月度班次配置',
        scheduleDisplay: '排班结果',
        fullRest: '全量休息配置'
    },

    PAGE_PREREQUISITES: {
        schedulePeriod: [],
        schedule: [],
        staff: ['activeSchedulePeriodConfigId'],
        request: ['activeSchedulePeriodConfigId', 'activeConfigId'],
        ruleConfig: ['activeSchedulePeriodConfigId', 'activeConfigId', 'activeRequestConfigId'],
        dailyManpower: ['activeSchedulePeriodConfigId', 'activeConfigId', 'activeRequestConfigId'],
        minimumManpower: ['activeSchedulePeriodConfigId', 'activeConfigId', 'activeRequestConfigId'],
        nightShift: ['activeSchedulePeriodConfigId', 'activeConfigId', 'activeRequestConfigId'],
        monthlySchedule: ['activeSchedulePeriodConfigId', 'activeConfigId', 'activeRequestConfigId'],
        scheduleDisplay: ['activeSchedulePeriodConfigId', 'activeConfigId', 'activeRequestConfigId'],
        fullRest: ['activeSchedulePeriodConfigId', 'activeConfigId', 'activeRequestConfigId']
    },

    ROLE_LABELS: {
        SYS_ADMIN: '系统管理员',
        CITY_SCHEDULER: '城市排班员',
        COORDINATOR: '双城统筹者',
        AUDITOR: '审计只读'
    },

    escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    normalizeRole(role, fallback = 'CITY_SCHEDULER') {
        const key = String(role || '').trim().toUpperCase();
        if (this.ROLE_LABELS[key]) return key;
        return fallback;
    },

    normalizeCityScope(scope, fallback = 'ALL') {
        if (typeof CityUtils !== 'undefined' && CityUtils && typeof CityUtils.normalizeCityScope === 'function') {
            return CityUtils.normalizeCityScope(scope, fallback);
        }
        const value = String(scope || '').trim().toUpperCase();
        if (value === 'SH' || value === 'CD' || value === 'ALL') return value;
        return fallback;
    },

    getSession() {
        if (typeof Store === 'undefined' || !Store || typeof Store.getCurrentSession !== 'function') {
            return null;
        }
        return Store.getCurrentSession();
    },

    getRole() {
        const session = this.getSession();
        return this.normalizeRole(session && session.role, 'CITY_SCHEDULER');
    },

    getCityAffiliation() {
        const session = this.getSession();
        return this.normalizeCityScope(session && session.cityAffiliation, 'ALL');
    },

    isReadOnlyRole(role = null) {
        return this.normalizeRole(role || this.getRole(), 'CITY_SCHEDULER') === 'AUDITOR';
    },

    canManageUsers() {
        return this.getRole() === 'SYS_ADMIN';
    },

    canViewAudit() {
        const role = this.getRole();
        return role === 'SYS_ADMIN' || role === 'COORDINATOR' || role === 'AUDITOR';
    },

    canEditCity(cityCode) {
        const role = this.getRole();
        const city = this.normalizeCityScope(cityCode, null);
        if (!city) return role !== 'AUDITOR';
        if (role === 'SYS_ADMIN' || role === 'COORDINATOR') return true;
        if (role === 'AUDITOR') return false;
        const affiliation = this.getCityAffiliation();
        if (role === 'CITY_SCHEDULER') {
            return (affiliation === 'SH' || affiliation === 'CD') && affiliation === city;
        }
        return affiliation === city;
    },

    canOperateScope(scope) {
        const role = this.getRole();
        const normalizedScope = this.normalizeCityScope(scope, 'ALL');
        if (role === 'SYS_ADMIN' || role === 'COORDINATOR') return true;
        if (role === 'AUDITOR') return false;
        const affiliation = this.getCityAffiliation();
        if (role === 'CITY_SCHEDULER') {
            if (affiliation !== 'SH' && affiliation !== 'CD') return false;
            return normalizedScope === affiliation;
        }
        return affiliation === normalizedScope;
    },

    checkActionPermission(configType = 'unknown', action = 'edit', context = {}) {
        const session = this.getSession();
        if (!session || !session.empNo) {
            return { allowed: false, message: '请先登录工号后再操作' };
        }
        const role = this.getRole();
        if (configType === 'user') {
            if (role !== 'SYS_ADMIN') {
                return { allowed: false, message: '仅系统管理员可维护用户账号' };
            }
            return { allowed: true, message: '' };
        }

        if (action === 'view') {
            return { allowed: true, message: '' };
        }

        if (role === 'AUDITOR') {
            return { allowed: false, message: '审计只读角色不可执行修改操作' };
        }

        const activeLock = (typeof Store !== 'undefined' && Store && typeof Store.getActiveLockContext === 'function')
            ? Store.getActiveLockContext()
            : null;
        const scopeHint = this.normalizeCityScope(
            context.cityScope
            || (context.config && context.config.cityScope)
            || (activeLock && activeLock.cityScope)
            || (session && session.activeCityScope)
            || 'ALL',
            'ALL'
        );
        if (!this.canOperateScope(scopeHint)) {
            const cityAffiliation = this.getCityAffiliation();
            const cityLabel = cityAffiliation === 'SH' ? '上海' : cityAffiliation === 'CD' ? '成都' : '双城';
            return {
                allowed: false,
                message: `当前工号仅可修改${cityLabel}范围，无法操作该配置`
            };
        }

        return { allowed: true, message: '' };
    },

    ensureLockChainConsistency(page) {
        if (typeof Store === 'undefined' || !Store) {
            return { ok: true, message: '' };
        }
        const activeLock = typeof Store.getActiveLockContext === 'function' ? Store.getActiveLockContext() : null;
        if (!activeLock || !activeLock.valid) {
            return { ok: true, message: '' };
        }

        const checks = [
            {
                stateKey: 'activeConfigId',
                getter: 'getStaffConfig',
                configType: 'staff',
                message: '激活人员配置与当前城市+周期锁不一致，请重新激活上游配置'
            },
            {
                stateKey: 'activeRequestConfigId',
                getter: 'getRequestConfig',
                configType: 'request',
                message: '激活个性化休假配置与当前城市+周期锁不一致，请重新激活上游配置'
            },
            {
                stateKey: 'activeFullRestConfigId',
                getter: 'getFullRestConfig',
                configType: 'fullRest',
                message: '激活全量休息配置与当前城市+周期锁不一致，请重新激活上游配置'
            },
            {
                stateKey: 'activeMonthlyShiftConfigId',
                getter: 'getMonthlyShiftConfig',
                configType: 'monthlyShift',
                message: '激活月度班次配置与当前城市+周期锁不一致，请重新激活上游配置'
            },
            {
                stateKey: 'activeMonthlyScheduleConfigId',
                getter: 'getMonthlyScheduleConfig',
                configType: 'monthlySchedule',
                message: '激活本月排班配置与当前城市+周期锁不一致，请重新激活上游配置'
            },
            {
                stateKey: 'activeNightShiftConfigId',
                getter: 'getNightShiftConfig',
                configType: 'nightShift',
                message: '激活大夜配置与当前城市+周期锁不一致，请重新激活上游配置'
            },
            {
                stateKey: 'activeScheduleResultConfigId',
                getter: 'getScheduleResultConfig',
                configType: 'scheduleResult',
                message: '激活排班结果配置与当前城市+周期锁不一致，请重新激活上游配置'
            }
        ];

        for (let i = 0; i < checks.length; i++) {
            const check = checks[i];
            const activeId = typeof Store.getState === 'function' ? Store.getState(check.stateKey) : null;
            if (!activeId) continue;
            const getterFn = Store && typeof Store[check.getter] === 'function' ? Store[check.getter].bind(Store) : null;
            if (!getterFn || typeof Store.isConfigInActiveLock !== 'function') continue;
            const config = getterFn(activeId);
            if (config && !Store.isConfigInActiveLock(config, { configType: check.configType })) {
                return { ok: false, message: check.message };
            }
        }

        const session = this.getSession();
        if (session && session.activeLockKey && activeLock.lockKey && session.activeLockKey !== activeLock.lockKey) {
            return { ok: false, message: '当前工号会话锁与系统激活锁不一致，请重新切换工号或激活周期后重试' };
        }
        return { ok: true, message: '' };
    },

    check(page, action = 'view') {
        const normalizedPage = String(page || '').trim();
        const session = this.getSession();
        if (!session || !session.empNo) {
            return { allowed: false, canAccess: false, message: '请先登录工号后再访问页面' };
        }

        const permission = this.checkActionPermission('page', action, {
            cityScope: session.activeCityScope || 'ALL'
        });
        if (!permission.allowed) {
            return { allowed: false, canAccess: false, message: permission.message };
        }

        const prerequisites = this.PAGE_PREREQUISITES[normalizedPage] || [];
        for (let i = 0; i < prerequisites.length; i++) {
            const stateKey = prerequisites[i];
            const value = typeof Store !== 'undefined' && Store && typeof Store.getState === 'function'
                ? Store.getState(stateKey)
                : null;
            if (!value) {
                const messageMap = {
                    activeSchedulePeriodConfigId: '请先激活一个排班周期配置',
                    activeConfigId: '请先激活一个人员管理配置',
                    activeRequestConfigId: '请先激活一个个性化休假配置'
                };
                return {
                    allowed: false,
                    canAccess: false,
                    message: messageMap[stateKey] || '前置激活条件不满足'
                };
            }
        }

        const lockCheck = this.ensureLockChainConsistency(normalizedPage);
        if (!lockCheck.ok) {
            return { allowed: false, canAccess: false, message: lockCheck.message };
        }

        return { allowed: true, canAccess: true, message: '' };
    },

    canMutateInCurrentContext() {
        const result = this.checkActionPermission('generic', 'edit', {});
        return !!(result && result.allowed);
    },

    showMessage(message) {
        if (typeof DialogUtils !== 'undefined' && DialogUtils && typeof DialogUtils.alert === 'function') {
            DialogUtils.alert(message);
        } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(message);
        }
        if (typeof StatusUtils !== 'undefined' && StatusUtils && typeof StatusUtils.updateStatus === 'function') {
            StatusUtils.updateStatus(message, 'error');
        }
    },

    renderSessionToolbar() {
        if (typeof document === 'undefined') return;
        const footerRow = document.querySelector('footer .px-6.py-3 .flex.items-center.space-x-4.flex-1');
        if (!footerRow) return;

        let wrapper = document.getElementById('sessionToolbar');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'sessionToolbar';
            wrapper.className = 'flex items-center space-x-2 ml-4';
            wrapper.innerHTML = [
                '<span class="text-xs text-gray-500">工号：</span>',
                '<select id="sessionEmpNoSelect" class="px-2 py-1 border border-gray-300 rounded text-xs bg-white"></select>',
                '<button id="sessionSwitchBtn" class="px-2 py-1 bg-slate-600 text-white rounded text-xs hover:bg-slate-700">切换</button>',
                '<button id="sessionManageBtn" class="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 hidden">用户管理</button>',
                '<button id="sessionAuditBtn" class="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 hidden">审计日志</button>',
                '<span id="sessionRoleBadge" class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700"></span>'
            ].join('');
            footerRow.appendChild(wrapper);

            const switchBtn = document.getElementById('sessionSwitchBtn');
            if (switchBtn) {
                switchBtn.addEventListener('click', async () => {
                    const select = document.getElementById('sessionEmpNoSelect');
                    const targetEmpNo = select ? String(select.value || '').trim() : '';
                    if (!targetEmpNo) return;
                    if (typeof Store === 'undefined' || !Store || typeof Store.login !== 'function') {
                        this.showMessage('登录模块不可用，请刷新重试');
                        return;
                    }
                    try {
                        await Store.login(targetEmpNo, true);
                        this.refreshSessionToolbar();
                        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                            window.dispatchEvent(new CustomEvent('sessionChanged', { detail: { empNo: targetEmpNo } }));
                        }
                    } catch (error) {
                        this.showMessage(error && error.message ? error.message : '切换工号失败');
                    }
                });
            }
            const manageBtn = document.getElementById('sessionManageBtn');
            if (manageBtn) {
                manageBtn.addEventListener('click', () => {
                    this.showUserManageDialog();
                });
            }
            const auditBtn = document.getElementById('sessionAuditBtn');
            if (auditBtn) {
                auditBtn.addEventListener('click', () => {
                    this.showAuditDialog();
                });
            }
        }

        this.refreshSessionToolbar();
    },

    refreshSessionToolbar() {
        if (typeof document === 'undefined') return;
        const select = document.getElementById('sessionEmpNoSelect');
        const badge = document.getElementById('sessionRoleBadge');
        if (!select || !badge) return;

        if (typeof Store === 'undefined' || !Store || typeof Store.getUsers !== 'function') return;
        const users = (Store.getUsers() || []).filter((u) => u && u.status === 'ACTIVE');
        const session = Store.getCurrentSession ? Store.getCurrentSession() : null;
        const currentEmpNo = session && session.empNo ? session.empNo : '';

        const options = users.map((user) => {
            const roleLabel = this.ROLE_LABELS[this.normalizeRole(user.role)] || user.role;
            const cityLabel = this.normalizeCityScope(user.cityAffiliation, 'ALL');
            return `<option value="${user.empNo}" ${user.empNo === currentEmpNo ? 'selected' : ''}>${user.empNo} ${user.name} (${roleLabel}/${cityLabel})</option>`;
        }).join('');
        select.innerHTML = options;

        const role = this.normalizeRole(session && session.role, 'CITY_SCHEDULER');
        const city = this.normalizeCityScope(session && session.cityAffiliation, 'ALL');
        const roleLabel = this.ROLE_LABELS[role] || role;
        badge.textContent = `${roleLabel} / ${city}`;

        const manageBtn = document.getElementById('sessionManageBtn');
        if (manageBtn) {
            const visible = this.canManageUsers();
            manageBtn.classList.toggle('hidden', !visible);
        }

        const auditBtn = document.getElementById('sessionAuditBtn');
        if (auditBtn) {
            const visible = this.canViewAudit();
            auditBtn.classList.toggle('hidden', !visible);
        }

        const switchBtn = document.getElementById('sessionSwitchBtn');
        if (switchBtn) {
            switchBtn.disabled = users.length === 0;
            switchBtn.classList.toggle('opacity-50', users.length === 0);
            switchBtn.classList.toggle('cursor-not-allowed', users.length === 0);
        }
    },

    showUserManageDialog() {
        if (!this.canManageUsers()) {
            this.showMessage('仅系统管理员可维护用户');
            return;
        }
        if (typeof document === 'undefined') return;
        const users = (typeof Store !== 'undefined' && Store && typeof Store.getUsers === 'function')
            ? Store.getUsers()
            : [];
        const roles = Object.keys(this.ROLE_LABELS);
        const roleOptions = (selectedRole) => roles.map((role) => (
            `<option value="${role}" ${role === selectedRole ? 'selected' : ''}>${this.escapeHtml(this.ROLE_LABELS[role])}</option>`
        )).join('');
        const cityOptions = (selectedCity) => ['SH', 'CD', 'ALL'].map((city) => (
            `<option value="${city}" ${city === selectedCity ? 'selected' : ''}>${city}</option>`
        )).join('');

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/40 z-[1200] flex items-center justify-center p-4';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <h3 class="text-base font-semibold text-gray-800">用户管理（工号）</h3>
                    <button id="user-manage-close" class="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">关闭</button>
                </div>
                <div class="p-4 overflow-auto space-y-4">
                    <div class="bg-slate-50 border border-slate-200 rounded p-3">
                        <div class="grid grid-cols-1 md:grid-cols-5 gap-2">
                            <input id="user-new-empno" class="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="工号(必填)">
                            <input id="user-new-name" class="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="姓名(可选)">
                            <select id="user-new-role" class="px-2 py-1 border border-gray-300 rounded text-sm">${roleOptions('CITY_SCHEDULER')}</select>
                            <select id="user-new-city" class="px-2 py-1 border border-gray-300 rounded text-sm">${cityOptions('ALL')}</select>
                            <button id="user-new-create" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">新增用户</button>
                        </div>
                    </div>
                    <div class="overflow-auto border border-gray-200 rounded">
                        <table class="min-w-full border-collapse">
                            <thead class="bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">工号</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">姓名</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">角色</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">归属城市</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">状态</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">创建人</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map((user) => `
                                    <tr data-user-row="${this.escapeHtml(user.empNo)}" class="hover:bg-gray-50">
                                        <td class="px-2 py-2 text-xs border border-gray-200">${this.escapeHtml(user.empNo)}</td>
                                        <td class="px-2 py-2 text-xs border border-gray-200"><input data-field="name" class="w-full px-2 py-1 border border-gray-300 rounded text-xs" value="${this.escapeHtml(user.name || '')}"></td>
                                        <td class="px-2 py-2 text-xs border border-gray-200"><select data-field="role" class="w-full px-1 py-1 border border-gray-300 rounded text-xs">${roleOptions(user.role || 'CITY_SCHEDULER')}</select></td>
                                        <td class="px-2 py-2 text-xs border border-gray-200"><select data-field="city" class="w-full px-1 py-1 border border-gray-300 rounded text-xs">${cityOptions(this.normalizeCityScope(user.cityAffiliation, 'ALL'))}</select></td>
                                        <td class="px-2 py-2 text-xs border border-gray-200"><select data-field="status" class="w-full px-1 py-1 border border-gray-300 rounded text-xs"><option value="ACTIVE" ${user.status !== 'DISABLED' ? 'selected' : ''}>ACTIVE</option><option value="DISABLED" ${user.status === 'DISABLED' ? 'selected' : ''}>DISABLED</option></select></td>
                                        <td class="px-2 py-2 text-xs border border-gray-200">${this.escapeHtml(user.createdByEmpNo || '-')}</td>
                                        <td class="px-2 py-2 text-xs border border-gray-200 space-x-1 whitespace-nowrap">
                                            <button data-action="save" class="px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700">保存</button>
                                            ${this.getSession() && this.getSession().empNo === user.empNo
                                                ? '<button data-action="delete" disabled title="不能删除当前登录用户" class="px-2 py-1 bg-gray-400 text-white rounded cursor-not-allowed">删除</button>'
                                                : '<button data-action="delete" class="px-2 py-1 bg-rose-600 text-white rounded hover:bg-rose-700">删除</button>'
                                            }
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            this.refreshSessionToolbar();
        };
        const closeBtn = overlay.querySelector('#user-manage-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const createBtn = overlay.querySelector('#user-new-create');
        if (createBtn) {
            createBtn.addEventListener('click', async () => {
                const empNo = String((overlay.querySelector('#user-new-empno') || {}).value || '').trim();
                const name = String((overlay.querySelector('#user-new-name') || {}).value || '').trim();
                const role = String((overlay.querySelector('#user-new-role') || {}).value || 'CITY_SCHEDULER');
                const city = String((overlay.querySelector('#user-new-city') || {}).value || 'ALL');
                if (!empNo) {
                    this.showMessage('请填写工号');
                    return;
                }
                try {
                    await Store.createUser({ empNo, name, role, cityAffiliation: city }, true);
                    close();
                    this.showUserManageDialog();
                } catch (error) {
                    this.showMessage(error && error.message ? error.message : '新增用户失败');
                }
            });
        }

        overlay.querySelectorAll('tr[data-user-row]').forEach((row) => {
            const empNo = row.getAttribute('data-user-row');
            row.querySelectorAll('button[data-action]').forEach((btn) => {
                const action = btn.getAttribute('data-action');
                btn.addEventListener('click', async () => {
                    try {
                        if (action === 'save') {
                            const name = String((row.querySelector('[data-field=\"name\"]') || {}).value || '').trim();
                            const role = String((row.querySelector('[data-field=\"role\"]') || {}).value || 'CITY_SCHEDULER');
                            const cityAffiliation = String((row.querySelector('[data-field=\"city\"]') || {}).value || 'ALL');
                            const status = String((row.querySelector('[data-field=\"status\"]') || {}).value || 'ACTIVE');
                            await Store.updateUser(empNo, { name, role, cityAffiliation, status }, true);
                            this.showMessage(`用户 ${empNo} 已更新`);
                        } else if (action === 'delete') {
                            if (!confirm(`确定删除用户 ${empNo} 吗？`)) return;
                            await Store.deleteUser(empNo, true);
                            close();
                            this.showUserManageDialog();
                        }
                    } catch (error) {
                        this.showMessage(error && error.message ? error.message : '用户操作失败');
                    }
                });
            });
        });
    },

    getAuditLogs() {
        if (typeof Store === 'undefined' || !Store || typeof Store.getAuditLogs !== 'function') {
            return [];
        }
        const logs = Store.getAuditLogs();
        if (!Array.isArray(logs)) return [];
        return logs
            .slice()
            .sort((a, b) => {
                const ta = a && a.timestamp ? Date.parse(a.timestamp) : 0;
                const tb = b && b.timestamp ? Date.parse(b.timestamp) : 0;
                return tb - ta;
            });
    },

    toCsvCell(value) {
        const raw = value == null ? '' : String(value);
        if (!/[",\n]/.test(raw)) return raw;
        return `"${raw.replace(/"/g, '""')}"`;
    },

    exportAuditLogsToCsv(logs) {
        const source = Array.isArray(logs) ? logs : [];
        const headers = [
            'timestamp',
            'empNo',
            'role',
            'action',
            'entityType',
            'entityId',
            'cityScope',
            'lockKey',
            'beforeSummary',
            'afterSummary'
        ];
        const lines = [headers.join(',')];
        source.forEach((row) => {
            const values = headers.map((key) => this.toCsvCell(row && row[key]));
            lines.push(values.join(','));
        });
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `audit-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    },

    showAuditDialog() {
        if (!this.canViewAudit()) {
            this.showMessage('当前角色无权查看审计日志');
            return;
        }
        if (typeof document === 'undefined') return;

        const allLogs = this.getAuditLogs();
        const actionSet = Array.from(new Set(allLogs.map((item) => item && item.action).filter(Boolean))).sort();
        const entitySet = Array.from(new Set(allLogs.map((item) => item && item.entityType).filter(Boolean))).sort();

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/40 z-[1250] flex items-center justify-center p-4';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <h3 class="text-base font-semibold text-gray-800">审计日志</h3>
                    <button id="audit-close-btn" class="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">关闭</button>
                </div>
                <div class="p-4 border-b border-gray-100 grid grid-cols-1 md:grid-cols-6 gap-2">
                    <input id="audit-filter-empno" class="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="工号筛选">
                    <select id="audit-filter-action" class="px-2 py-1 border border-gray-300 rounded text-sm">
                        <option value="">全部动作</option>
                        ${actionSet.map((action) => `<option value="${this.escapeHtml(action)}">${this.escapeHtml(action)}</option>`).join('')}
                    </select>
                    <select id="audit-filter-entity" class="px-2 py-1 border border-gray-300 rounded text-sm">
                        <option value="">全部实体</option>
                        ${entitySet.map((entity) => `<option value="${this.escapeHtml(entity)}">${this.escapeHtml(entity)}</option>`).join('')}
                    </select>
                    <input id="audit-filter-lock" class="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="LockKey筛选">
                    <input id="audit-filter-keyword" class="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="摘要关键字">
                    <select id="audit-filter-limit" class="px-2 py-1 border border-gray-300 rounded text-sm">
                        <option value="100">最近100条</option>
                        <option value="300" selected>最近300条</option>
                        <option value="1000">最近1000条</option>
                        <option value="5000">全部(最多5000条)</option>
                    </select>
                </div>
                <div class="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                    <span id="audit-count-text" class="text-xs text-gray-600">共 0 条</span>
                    <button id="audit-export-btn" class="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">导出 CSV</button>
                </div>
                <div class="overflow-auto p-4">
                    <table class="min-w-full border-collapse">
                        <thead class="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">时间</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">工号</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">角色</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">动作</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">实体</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">实体ID</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">城市</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">LockKey</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">变更前摘要</th>
                                <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">变更后摘要</th>
                            </tr>
                        </thead>
                        <tbody id="audit-log-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const tbody = overlay.querySelector('#audit-log-tbody');
        const countText = overlay.querySelector('#audit-count-text');
        const limitSelect = overlay.querySelector('#audit-filter-limit');
        const empNoInput = overlay.querySelector('#audit-filter-empno');
        const actionSelect = overlay.querySelector('#audit-filter-action');
        const entitySelect = overlay.querySelector('#audit-filter-entity');
        const lockInput = overlay.querySelector('#audit-filter-lock');
        const keywordInput = overlay.querySelector('#audit-filter-keyword');
        const closeBtn = overlay.querySelector('#audit-close-btn');
        const exportBtn = overlay.querySelector('#audit-export-btn');

        const close = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        const getFilteredLogs = () => {
            const limit = Number((limitSelect && limitSelect.value) || 300) || 300;
            const empNo = String((empNoInput && empNoInput.value) || '').trim().toLowerCase();
            const action = String((actionSelect && actionSelect.value) || '').trim();
            const entity = String((entitySelect && entitySelect.value) || '').trim();
            const lockKey = String((lockInput && lockInput.value) || '').trim().toLowerCase();
            const keyword = String((keywordInput && keywordInput.value) || '').trim().toLowerCase();
            const filtered = allLogs.filter((item) => {
                if (!item) return false;
                if (empNo && !String(item.empNo || '').toLowerCase().includes(empNo)) return false;
                if (action && String(item.action || '') !== action) return false;
                if (entity && String(item.entityType || '') !== entity) return false;
                if (lockKey && !String(item.lockKey || '').toLowerCase().includes(lockKey)) return false;
                if (keyword) {
                    const beforeText = String(item.beforeSummary || '').toLowerCase();
                    const afterText = String(item.afterSummary || '').toLowerCase();
                    if (!beforeText.includes(keyword) && !afterText.includes(keyword)) {
                        return false;
                    }
                }
                return true;
            });
            return filtered.slice(0, limit);
        };

        const renderRows = () => {
            if (!tbody) return;
            const rows = getFilteredLogs();
            if (countText) {
                countText.textContent = `共 ${rows.length} 条（日志总量 ${allLogs.length}）`;
            }
            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="px-3 py-6 text-center text-sm text-gray-500 border border-gray-200">暂无审计记录</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map((item) => {
                const timestamp = item && item.timestamp ? item.timestamp.replace('T', ' ').replace('Z', '') : '-';
                const beforeSummary = this.escapeHtml(item && item.beforeSummary ? item.beforeSummary : '');
                const afterSummary = this.escapeHtml(item && item.afterSummary ? item.afterSummary : '');
                return `
                    <tr class="hover:bg-gray-50 align-top">
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(timestamp)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(item && item.empNo)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(item && item.role)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(item && item.action)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(item && item.entityType)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(item && item.entityId)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(item && item.cityScope)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 whitespace-nowrap">${this.escapeHtml(item && item.lockKey)}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 break-all max-w-[320px]" title="${beforeSummary}">${beforeSummary || '-'}</td>
                        <td class="px-2 py-2 text-xs border border-gray-200 break-all max-w-[320px]" title="${afterSummary}">${afterSummary || '-'}</td>
                    </tr>
                `;
            }).join('');
        };

        if (closeBtn) closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close();
        });
        [limitSelect, empNoInput, actionSelect, entitySelect, lockInput, keywordInput].forEach((el) => {
            if (!el) return;
            el.addEventListener('input', renderRows);
            el.addEventListener('change', renderRows);
        });
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAuditLogsToCsv(getFilteredLogs());
            });
        }

        renderRows();
    },

    bootstrapSession() {
        if (typeof Store === 'undefined' || !Store) return;
        if (typeof Store.ensureUsersAndSessionShape === 'function') {
            Store.ensureUsersAndSessionShape();
        }
        const session = typeof Store.getCurrentSession === 'function' ? Store.getCurrentSession() : null;
        if (!session && typeof Store.login === 'function') {
            const users = typeof Store.getUsers === 'function' ? Store.getUsers() : [];
            const fallback = users && users.length > 0 ? users[0] : null;
            if (fallback) {
                Store.login(fallback.empNo, false).catch((error) => {
                    console.error('自动登录失败:', error);
                });
            }
        }
        this.renderSessionToolbar();
    }
};

if (typeof window !== 'undefined') {
    window.AccessGuard = AccessGuard;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccessGuard;
}
