/**
 * 状态管理模块 - 负责应用状态的管理和持久化
 */

// 休假类型常量
const VACATION_TYPES = {
    ANNUAL: 'ANNUAL',      // 指定休假（使用年假）- 蓝色标识
    LEGAL: 'LEGAL',        // 指定需求休假（不使用年假）- 绿色标识
    AUTO: 'REQ'            // 自动判断（兼容旧格式）- 灰色标识
};

const Store = {
    // 状态数据
    state: {
        // 人员数据（按ID组织，每个ID包含历史记录数组）
        // 格式: { "staffId": [{ data, createdAt, expiresAt, isValid, versionId }, ...] }
        staffDataHistory: {},
        // 人员配置记录（多个配置快照）
        // 格式: [{ configId, name, staffDataSnapshot, createdAt, updatedAt }, ...]
        staffConfigs: [],
        // 当前激活的配置ID
        activeConfigId: null,
        // 排班配置（日期范围等）
        scheduleConfig: {
            startDate: null,
            endDate: null,
            year: null,
            month: null
        },
        // 约束条件（休假需求等）
        constraints: [],
        // 个人休假需求（个性化需求录入）
        // 格式: { "staffId": { "YYYY-MM-DD": "REQ", ... }, ... }
        personalRequests: {},
        // 个性化需求配置记录（多个配置快照）
        // 格式: [{ configId, name, personalRequestsSnapshot, createdAt, updatedAt }, ...]
        requestConfigs: [],
        // 当前激活的需求配置ID
        activeRequestConfigId: null,
        // 排班周期配置记录（多个配置快照）
        // 格式: [{ configId, name, scheduleConfig, restDaysSnapshot, schedulePeriod, createdAt, updatedAt }, ...]
        schedulePeriodConfigs: [],
        // 当前激活的排班周期配置ID
        activeSchedulePeriodConfigId: null,
        // 当前激活的排版配置ID
        activeDailyManpowerConfigId: null,
        // 排班结果配置记录（多个配置快照）
        // 格式: [{ configId, name, scheduleResultSnapshot, scheduleConfig, schedulePeriod, createdAt, updatedAt }, ...]
        scheduleResultConfigs: [],
        // 当前激活的排班结果配置ID
        activeScheduleResultConfigId: null,
        // 法定休息日配置（当前周期）
        // 格式: { "YYYY-MM-DD": true/false, ... } true表示休息日，false表示工作日
        restDays: {},
        // 最终排班结果
        finalSchedule: null,
        // 当前视图状态（用于页面刷新后恢复视图）
        // 可选值: 'schedule', 'staff', 'request'
        currentView: 'schedule',
        // 当前子视图状态（用于恢复子页面）
        // StaffManager: 'configs' | 'staffList'
        // RequestManager: 'configs' | 'requestList'
        currentSubView: null,
        // 当前查看的配置ID（用于恢复子页面）
        currentConfigId: null,
        // 年假配额管理（可选，从员工数据中读取）
        // 格式: { "staffId": { total: X, used: Y, balance: Z } }
        annualLeaveQuotas: {},
        // 全量休息配置记录（多个配置快照）
        // 格式: [{ configId, name, schedulePeriodConfigId, fullRestSchedule, constraints, createdAt, updatedAt }, ...]
        fullRestConfigs: [],
        // 当前激活的全量休息配置ID
        activeFullRestConfigId: null,
        // 月度班次配置记录（多个配置快照）
        // 格式: [{ configId, name, monthlyShifts, schedulePeriod, createdAt, updatedAt }, ...]
        // monthlyShifts: { "staffId": "A1/A/A2/B1/B2", ... }
        monthlyShiftConfigs: [],
        // 当前激活的月度班次配置ID
        activeMonthlyShiftConfigId: null,
        // 月度班次后台生成任务状态（按配置ID索引）
        monthlyScheduleGenerationJobs: {},
        // 当前城市作用域（SH | CD | ALL）
        activeCityScope: 'ALL',
        // 城市维度配置
        cityDimension: {
            enabled: true,
            defaultCity: 'SH',
            supportedCities: ['SH', 'CD']
        },
        // 用户与权限（本地账号，工号主键）
        users: [],
        // 当前登录会话上下文
        // { empNo, role, cityAffiliation, activePeriodId, activeCityScope, activeLockKey, loginAt }
        currentSession: null,
        // 按工号持久化的激活上下文快照，支持“每用户独立锁”
        // { [empNo]: { activeSchedulePeriodConfigId, activeCityScope, activeConfigId, ... } }
        userLockContexts: {},
        // 审计日志
        auditLogs: [],
        // 按城市+周期锁归档的规则配置快照
        ruleConfigProfiles: {},
        // 按城市+周期锁归档的最低人力配置快照
        minimumManpowerProfiles: {}
    },

    /**
     * 获取状态
     * @param {string} key - 状态键名（可选，不传则返回整个状态）
     * @returns {*} 状态值或整个状态对象
     */
    getState(key) {
        if (key) {
            return this.state[key];
        }
        return this.state;
    },

    getMonthlyScheduleGenerationJobs() {
        const jobs = this.state.monthlyScheduleGenerationJobs;
        if (!jobs || typeof jobs !== 'object') {
            this.state.monthlyScheduleGenerationJobs = {};
        }
        return this.state.monthlyScheduleGenerationJobs;
    },

    setMonthlyScheduleGenerationJobs(jobs = {}, autoSave = false) {
        this.state.monthlyScheduleGenerationJobs = (jobs && typeof jobs === 'object')
            ? jobs
            : {};
        if (autoSave) {
            this.saveState();
        }
    },

    getRoleDefinitions() {
        return {
            SYS_ADMIN: { code: 'SYS_ADMIN', label: '系统管理员' },
            CITY_SCHEDULER: { code: 'CITY_SCHEDULER', label: '城市排班员' },
            COORDINATOR: { code: 'COORDINATOR', label: '双城统筹者' },
            AUDITOR: { code: 'AUDITOR', label: '审计只读' }
        };
    },

    normalizeRole(role, fallback = 'CITY_SCHEDULER') {
        const defs = this.getRoleDefinitions();
        const key = String(role || '').trim().toUpperCase();
        if (defs[key]) return key;
        return fallback;
    },

    normalizeCityAffiliation(cityAffiliation, fallback = 'ALL') {
        return this.normalizeCityScope(cityAffiliation, fallback);
    },

    getDefaultUsers() {
        const now = new Date().toISOString();
        return [
            {
                empNo: '900000',
                name: '系统管理员',
                role: 'SYS_ADMIN',
                cityAffiliation: 'ALL',
                status: 'ACTIVE',
                createdAt: now,
                updatedAt: now,
                createdByEmpNo: 'SYSTEM_MIGRATION',
                updatedByEmpNo: 'SYSTEM_MIGRATION'
            },
            {
                empNo: '900101',
                name: '上海排班员',
                role: 'CITY_SCHEDULER',
                cityAffiliation: 'SH',
                status: 'ACTIVE',
                createdAt: now,
                updatedAt: now,
                createdByEmpNo: 'SYSTEM_MIGRATION',
                updatedByEmpNo: 'SYSTEM_MIGRATION'
            },
            {
                empNo: '900201',
                name: '成都排班员',
                role: 'CITY_SCHEDULER',
                cityAffiliation: 'CD',
                status: 'ACTIVE',
                createdAt: now,
                updatedAt: now,
                createdByEmpNo: 'SYSTEM_MIGRATION',
                updatedByEmpNo: 'SYSTEM_MIGRATION'
            },
            {
                empNo: '900301',
                name: '双城统筹者',
                role: 'COORDINATOR',
                cityAffiliation: 'ALL',
                status: 'ACTIVE',
                createdAt: now,
                updatedAt: now,
                createdByEmpNo: 'SYSTEM_MIGRATION',
                updatedByEmpNo: 'SYSTEM_MIGRATION'
            },
            {
                empNo: '900401',
                name: '审计只读',
                role: 'AUDITOR',
                cityAffiliation: 'ALL',
                status: 'ACTIVE',
                createdAt: now,
                updatedAt: now,
                createdByEmpNo: 'SYSTEM_MIGRATION',
                updatedByEmpNo: 'SYSTEM_MIGRATION'
            }
        ];
    },

    ensureUsersAndSessionShape() {
        if (!Array.isArray(this.state.users)) {
            this.state.users = [];
        }
        if (!this.state.userLockContexts || typeof this.state.userLockContexts !== 'object') {
            this.state.userLockContexts = {};
        }
        if (!Array.isArray(this.state.auditLogs)) {
            this.state.auditLogs = [];
        }

        if (this.state.users.length === 0) {
            this.state.users = this.getDefaultUsers();
        } else {
            this.state.users = this.state.users.map((user) => {
                const now = new Date().toISOString();
                const empNo = String(user && user.empNo ? user.empNo : '').trim();
                return {
                    empNo,
                    name: String(user && user.name ? user.name : empNo || '未命名用户'),
                    role: this.normalizeRole(user && user.role, 'CITY_SCHEDULER'),
                    cityAffiliation: this.normalizeCityAffiliation(user && user.cityAffiliation, 'ALL'),
                    status: String(user && user.status ? user.status : 'ACTIVE').toUpperCase() === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
                    createdAt: user && user.createdAt ? user.createdAt : now,
                    updatedAt: user && user.updatedAt ? user.updatedAt : now,
                    createdByEmpNo: user && user.createdByEmpNo ? user.createdByEmpNo : 'SYSTEM_MIGRATION',
                    updatedByEmpNo: user && user.updatedByEmpNo ? user.updatedByEmpNo : 'SYSTEM_MIGRATION'
                };
            }).filter((user) => !!user.empNo);
        }

        if (!this.state.currentSession || !this.state.currentSession.empNo) {
            const fallbackUser = this.state.users.find((user) => user.status === 'ACTIVE') || this.state.users[0] || null;
            if (fallbackUser) {
                const fallbackLock = this.state.userLockContexts[fallbackUser.empNo] || {};
                this.state.currentSession = {
                    empNo: fallbackUser.empNo,
                    role: fallbackUser.role,
                    cityAffiliation: fallbackUser.cityAffiliation,
                    activePeriodId: fallbackLock.activeSchedulePeriodConfigId || null,
                    activeCityScope: this.normalizeCityScope(fallbackLock.activeCityScope || this.state.activeCityScope, 'ALL'),
                    activeLockKey: this.buildLockKey(
                        fallbackLock.activeSchedulePeriodConfigId || null,
                        this.normalizeCityScope(fallbackLock.activeCityScope || this.state.activeCityScope, 'ALL')
                    ),
                    loginAt: new Date().toISOString()
                };
            }
        } else {
            this.state.currentSession.role = this.normalizeRole(this.state.currentSession.role, 'CITY_SCHEDULER');
            this.state.currentSession.cityAffiliation = this.normalizeCityAffiliation(this.state.currentSession.cityAffiliation, 'ALL');
            this.state.currentSession.activeCityScope = this.normalizeCityScope(this.state.currentSession.activeCityScope || this.state.activeCityScope, 'ALL');
            this.state.currentSession.activeLockKey = this.buildLockKey(
                this.state.currentSession.activePeriodId || null,
                this.state.currentSession.activeCityScope
            );
        }
        this.enforceCurrentSessionScopeRestrictions();
    },

    getCurrentSession() {
        this.ensureUsersAndSessionShape();
        return this.state.currentSession || null;
    },

    getCurrentEmpNo(fallback = 'SYSTEM') {
        const session = this.getCurrentSession();
        if (session && session.empNo) {
            return session.empNo;
        }
        return fallback;
    },

    getCurrentRole(fallback = 'CITY_SCHEDULER') {
        const session = this.getCurrentSession();
        if (session && session.role) {
            return this.normalizeRole(session.role, fallback);
        }
        return fallback;
    },

    getCurrentCityAffiliation(fallback = 'ALL') {
        const session = (this.state.currentSession && this.state.currentSession.empNo)
            ? this.state.currentSession
            : this.getCurrentSession();
        if (session && session.cityAffiliation) {
            return this.normalizeCityAffiliation(session.cityAffiliation, fallback);
        }
        return this.normalizeCityAffiliation(fallback, 'ALL');
    },

    getSchedulerCityScopeRestriction() {
        const session = this.state.currentSession || null;
        const role = session
            ? this.normalizeRole(session.role, 'CITY_SCHEDULER')
            : this.getCurrentRole('CITY_SCHEDULER');
        if (role !== 'CITY_SCHEDULER') return null;
        const affiliation = this.getCurrentCityAffiliation('ALL');
        if (affiliation === 'SH' || affiliation === 'CD') {
            return affiliation;
        }
        return null;
    },

    canCurrentUserViewScope(scope) {
        const normalizedScope = this.normalizeCityScope(scope, 'ALL');
        const restriction = this.getSchedulerCityScopeRestriction();
        if (!restriction) return true;
        return normalizedScope === restriction;
    },

    resolveConfigCityScope(config, configType = null, fallback = 'ALL') {
        if (!config || typeof config !== 'object') {
            return this.normalizeCityScope(fallback, 'ALL');
        }
        if (configType === 'staff') {
            return this.getStaffConfigEffectiveCityScope(config, fallback);
        }
        if (config.cityScope !== undefined && config.cityScope !== null && String(config.cityScope).trim() !== '') {
            return this.normalizeCityScope(config.cityScope, fallback);
        }
        if (config.schedulePeriodConfigId) {
            const linkedPeriod = this.getSchedulePeriodConfig(config.schedulePeriodConfigId);
            if (linkedPeriod) {
                return this.normalizeCityScope(linkedPeriod.cityScope, fallback);
            }
        }
        if (config.lockKey) {
            const parsed = this.parseLockKey(config.lockKey);
            if (parsed && parsed.cityScope) {
                return this.normalizeCityScope(parsed.cityScope, fallback);
            }
        }
        return this.normalizeCityScope(fallback, 'ALL');
    },

    filterConfigsByCurrentUserScope(configs, configType = null) {
        const list = Array.isArray(configs) ? configs : [];
        const restriction = this.getSchedulerCityScopeRestriction();
        if (!restriction) {
            return list;
        }
        return list.filter((config) => {
            const scope = this.resolveConfigCityScope(config, configType, restriction);
            return scope === restriction;
        });
    },

    getUsers() {
        this.ensureUsersAndSessionShape();
        return this.state.users;
    },

    getUserByEmpNo(empNo) {
        const normalized = String(empNo || '').trim();
        if (!normalized) return null;
        return this.getUsers().find((item) => item.empNo === normalized) || null;
    },

    canManageUsers() {
        return this.getCurrentRole('CITY_SCHEDULER') === 'SYS_ADMIN';
    },

    createUser(userInput = {}, autoSave = true) {
        if (!this.canManageUsers()) {
            throw new Error('仅系统管理员可创建用户');
        }
        this.ensureUsersAndSessionShape();
        const empNo = String(userInput.empNo || '').trim();
        if (!empNo) {
            throw new Error('工号不能为空');
        }
        if (this.getUserByEmpNo(empNo)) {
            throw new Error(`工号 ${empNo} 已存在`);
        }
        const now = new Date().toISOString();
        const actorEmpNo = this.getCurrentEmpNo();
        const user = {
            empNo,
            name: String(userInput.name || empNo).trim(),
            role: this.normalizeRole(userInput.role, 'CITY_SCHEDULER'),
            cityAffiliation: this.normalizeCityAffiliation(userInput.cityAffiliation, 'ALL'),
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
            createdByEmpNo: actorEmpNo,
            updatedByEmpNo: actorEmpNo
        };
        this.state.users.push(user);
        this.appendAuditLog({
            action: 'CREATE_USER',
            entityType: 'user',
            entityId: empNo,
            before: null,
            after: user
        });
        if (autoSave) {
            this.saveState();
        }
        return user;
    },

    updateUser(empNo, updates = {}, autoSave = true) {
        if (!this.canManageUsers()) {
            throw new Error('仅系统管理员可更新用户');
        }
        const user = this.getUserByEmpNo(empNo);
        if (!user) {
            throw new Error(`用户不存在: ${empNo}`);
        }
        const before = this.deepClone(user);
        if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
            user.name = String(updates.name || user.name).trim();
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'role')) {
            user.role = this.normalizeRole(updates.role, user.role);
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'cityAffiliation')) {
            user.cityAffiliation = this.normalizeCityAffiliation(updates.cityAffiliation, user.cityAffiliation || 'ALL');
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
            user.status = String(updates.status || 'ACTIVE').toUpperCase() === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
        }
        user.updatedAt = new Date().toISOString();
        user.updatedByEmpNo = this.getCurrentEmpNo();
        this.appendAuditLog({
            action: 'UPDATE_USER',
            entityType: 'user',
            entityId: empNo,
            before,
            after: user
        });
        if (autoSave) {
            this.saveState();
        }
        return user;
    },

    deleteUser(empNo, autoSave = true) {
        if (!this.canManageUsers()) {
            throw new Error('仅系统管理员可删除用户');
        }
        const normalized = String(empNo || '').trim();
        const index = this.state.users.findIndex((user) => user.empNo === normalized);
        if (index < 0) {
            throw new Error(`用户不存在: ${normalized}`);
        }
        const target = this.state.users[index];
        if (target.empNo === this.getCurrentEmpNo()) {
            throw new Error('不能删除当前登录用户');
        }
        this.state.users.splice(index, 1);
        if (this.state.userLockContexts && this.state.userLockContexts[normalized]) {
            delete this.state.userLockContexts[normalized];
        }
        this.appendAuditLog({
            action: 'DELETE_USER',
            entityType: 'user',
            entityId: normalized,
            before: target,
            after: null
        });
        if (autoSave) {
            this.saveState();
        }
    },

    getUserLockContext(empNo = null) {
        this.ensureUsersAndSessionShape();
        const targetEmpNo = String(empNo || this.getCurrentEmpNo('')).trim();
        if (!targetEmpNo) return null;
        return this.state.userLockContexts[targetEmpNo] || null;
    },

    persistCurrentUserLockContext() {
        const session = this.getCurrentSession();
        if (!session || !session.empNo) return;
        if (!this.state.userLockContexts || typeof this.state.userLockContexts !== 'object') {
            this.state.userLockContexts = {};
        }
        this.state.userLockContexts[session.empNo] = {
            activeSchedulePeriodConfigId: this.state.activeSchedulePeriodConfigId || null,
            activeCityScope: this.normalizeCityScope(this.state.activeCityScope, 'ALL'),
            activeConfigId: this.state.activeConfigId || null,
            activeRequestConfigId: this.state.activeRequestConfigId || null,
            activeFullRestConfigId: this.state.activeFullRestConfigId || null,
            activeMonthlyShiftConfigId: this.state.activeMonthlyShiftConfigId || null,
            activeMonthlyScheduleConfigId: this.state.activeMonthlyScheduleConfigId || null,
            activeNightShiftConfigId: this.state.activeNightShiftConfigId || null,
            activeScheduleResultConfigId: this.state.activeScheduleResultConfigId || null,
            activeDailyManpowerConfigId: this.state.activeDailyManpowerConfigId || null,
            updatedAt: new Date().toISOString()
        };
        session.activePeriodId = this.state.activeSchedulePeriodConfigId || null;
        session.activeCityScope = this.normalizeCityScope(this.state.activeCityScope, 'ALL');
        session.activeLockKey = this.buildLockKey(session.activePeriodId, session.activeCityScope);
    },

    restoreUserLockContext(empNo = null) {
        const session = this.getCurrentSession();
        const targetEmpNo = String(empNo || (session && session.empNo) || '').trim();
        if (!targetEmpNo) return false;
        const lock = this.getUserLockContext(targetEmpNo);
        if (!lock) {
            return false;
        }
        this.state.activeSchedulePeriodConfigId = lock.activeSchedulePeriodConfigId || null;
        this.state.activeCityScope = this.normalizeCityScope(lock.activeCityScope, 'ALL');
        this.state.activeConfigId = lock.activeConfigId || null;
        this.state.activeRequestConfigId = lock.activeRequestConfigId || null;
        this.state.activeFullRestConfigId = lock.activeFullRestConfigId || null;
        this.state.activeMonthlyShiftConfigId = lock.activeMonthlyShiftConfigId || null;
        this.state.activeMonthlyScheduleConfigId = lock.activeMonthlyScheduleConfigId || null;
        this.state.activeNightShiftConfigId = lock.activeNightShiftConfigId || null;
        this.state.activeScheduleResultConfigId = lock.activeScheduleResultConfigId || null;
        this.state.activeDailyManpowerConfigId = lock.activeDailyManpowerConfigId || null;
        const activePeriodConfig = this.state.activeSchedulePeriodConfigId
            ? this.getSchedulePeriodConfig(this.state.activeSchedulePeriodConfigId)
            : null;
        if (activePeriodConfig && activePeriodConfig.scheduleConfig) {
            this.state.scheduleConfig = this.deepClone(activePeriodConfig.scheduleConfig);
        }
        if (activePeriodConfig && activePeriodConfig.restDaysSnapshot) {
            this.state.restDays = this.deepClone(activePeriodConfig.restDaysSnapshot);
        }
        const activeRequestConfig = this.state.activeRequestConfigId
            ? this.getRequestConfig(this.state.activeRequestConfigId)
            : null;
        if (activeRequestConfig && activeRequestConfig.personalRequestsSnapshot) {
            this.state.personalRequests = this.deepClone(activeRequestConfig.personalRequestsSnapshot);
        } else if (!this.state.activeRequestConfigId) {
            this.state.personalRequests = {};
        }
        const activeResultConfig = this.state.activeScheduleResultConfigId
            ? this.getScheduleResultConfig(this.state.activeScheduleResultConfigId)
            : null;
        if (activeResultConfig && activeResultConfig.scheduleResultSnapshot) {
            this.state.finalSchedule = this.deepClone(activeResultConfig.scheduleResultSnapshot);
        } else if (!this.state.activeScheduleResultConfigId) {
            this.state.finalSchedule = null;
        }
        if (session && session.empNo === targetEmpNo) {
            session.activePeriodId = this.state.activeSchedulePeriodConfigId || null;
            session.activeCityScope = this.state.activeCityScope;
            session.activeLockKey = this.buildLockKey(session.activePeriodId, session.activeCityScope);
        }
        this.enforceActiveLockConsistency();
        return true;
    },

    enforceCurrentSessionScopeRestrictions() {
        const session = this.state.currentSession || null;
        if (!session || !session.empNo) return false;
        const restriction = this.getSchedulerCityScopeRestriction();
        if (!restriction) return false;

        let changed = false;
        if (this.normalizeCityScope(this.state.activeCityScope, 'ALL') !== restriction) {
            this.state.activeCityScope = restriction;
            changed = true;
        }

        const activePeriodConfig = this.state.activeSchedulePeriodConfigId
            ? this.getSchedulePeriodConfig(this.state.activeSchedulePeriodConfigId)
            : null;
        if (activePeriodConfig && this.normalizeCityScope(activePeriodConfig.cityScope, 'ALL') !== restriction) {
            this.state.activeSchedulePeriodConfigId = null;
            this.state.scheduleConfig = null;
            this.state.restDays = {};
            this.state.activeConfigId = null;
            this.state.activeRequestConfigId = null;
            this.state.activeFullRestConfigId = null;
            this.state.activeMonthlyShiftConfigId = null;
            this.state.activeMonthlyScheduleConfigId = null;
            this.state.activeNightShiftConfigId = null;
            this.state.activeScheduleResultConfigId = null;
            this.state.activeDailyManpowerConfigId = null;
            this.state.personalRequests = {};
            this.state.finalSchedule = null;
            changed = true;
        }

        this.enforceActiveLockConsistency();
        session.activePeriodId = this.state.activeSchedulePeriodConfigId || null;
        session.activeCityScope = restriction;
        session.activeLockKey = this.buildLockKey(session.activePeriodId, session.activeCityScope);
        return changed;
    },

    async login(empNo, autoSave = true) {
        this.ensureUsersAndSessionShape();
        const user = this.getUserByEmpNo(empNo);
        if (!user) {
            throw new Error(`工号不存在：${empNo}`);
        }
        if (user.status !== 'ACTIVE') {
            throw new Error(`工号已停用：${empNo}`);
        }
        this.state.currentSession = {
            empNo: user.empNo,
            role: user.role,
            cityAffiliation: user.cityAffiliation,
            activePeriodId: null,
            activeCityScope: this.normalizeCityScope(this.state.activeCityScope, 'ALL'),
            activeLockKey: null,
            loginAt: new Date().toISOString()
        };
        const restored = this.restoreUserLockContext(user.empNo);
        if (!restored) {
            this.persistCurrentUserLockContext();
        }
        this.enforceCurrentSessionScopeRestrictions();
        this.appendAuditLog({
            action: 'LOGIN',
            entityType: 'session',
            entityId: user.empNo,
            before: null,
            after: {
                empNo: user.empNo,
                role: user.role,
                cityAffiliation: user.cityAffiliation,
                activeLockKey: this.state.currentSession.activeLockKey
            }
        });
        if (autoSave) {
            await this.saveState();
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('sessionChanged', { detail: { empNo: user.empNo } }));
        }
        return this.deepClone(this.state.currentSession);
    },

    async logout(autoSave = true) {
        const session = this.getCurrentSession();
        if (session && session.empNo) {
            this.persistCurrentUserLockContext();
            this.appendAuditLog({
                action: 'LOGOUT',
                entityType: 'session',
                entityId: session.empNo,
                before: {
                    empNo: session.empNo,
                    role: session.role,
                    cityAffiliation: session.cityAffiliation,
                    activeLockKey: session.activeLockKey
                },
                after: null
            });
        }
        this.state.currentSession = null;
        if (autoSave) {
            await this.saveState();
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('sessionChanged', { detail: { empNo: null } }));
        }
    },

    summarizeForAudit(payload) {
        if (payload == null) return null;
        const text = JSON.stringify(payload);
        if (!text) return null;
        if (text.length <= 800) return text;
        return `${text.slice(0, 800)}...(truncated)`;
    },

    appendAuditLog(entry = {}, autoTrim = true) {
        this.ensureUsersAndSessionShape();
        const now = new Date().toISOString();
        const session = this.getCurrentSession();
        const activeLock = this.getActiveLockContext();
        const log = {
            auditId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: now,
            empNo: entry.empNo || (session && session.empNo) || 'SYSTEM',
            role: entry.role || (session && session.role) || 'SYSTEM',
            action: entry.action || 'UNKNOWN',
            entityType: entry.entityType || 'unknown',
            entityId: entry.entityId || null,
            cityScope: entry.cityScope || (activeLock && activeLock.cityScope) || this.normalizeCityScope(this.state.activeCityScope, 'ALL'),
            lockKey: entry.lockKey || (activeLock && activeLock.lockKey) || null,
            beforeSummary: this.summarizeForAudit(entry.before),
            afterSummary: this.summarizeForAudit(entry.after),
            meta: entry.meta ? this.deepClone(entry.meta) : null
        };
        this.state.auditLogs.push(log);
        if (autoTrim && this.state.auditLogs.length > 5000) {
            this.state.auditLogs = this.state.auditLogs.slice(-5000);
        }
        return log;
    },

    getAuditLogs() {
        this.ensureUsersAndSessionShape();
        return this.state.auditLogs;
    },

    assertCanMutate(configType = 'unknown', action = 'edit', context = {}) {
        if (typeof AccessGuard === 'undefined' || !AccessGuard || typeof AccessGuard.checkActionPermission !== 'function') {
            return { allowed: true, message: '' };
        }
        const result = AccessGuard.checkActionPermission(configType, action, context);
        if (!result || result.allowed !== true) {
            const message = result && result.message ? result.message : '当前用户无权限执行此操作';
            throw new Error(message);
        }
        return result;
    },

    normalizeConfigMeta(config, configType = null, options = {}) {
        if (!config || typeof config !== 'object') return config;
        const now = new Date().toISOString();
        const actorEmpNo = options.actorEmpNo || this.getCurrentEmpNo('SYSTEM');
        const inferredPeriodId = this.inferSchedulePeriodConfigId(config, configType);
        if (inferredPeriodId && !config.schedulePeriodConfigId) {
            config.schedulePeriodConfigId = inferredPeriodId;
        }
        if (!config.cityScope) {
            if (configType === 'staff') {
                config.cityScope = this.getStaffConfigEffectiveCityScope(config, this.getActiveCityScope());
            } else if (config.schedulePeriodConfigId) {
                const linked = this.getSchedulePeriodConfig(config.schedulePeriodConfigId);
                config.cityScope = this.normalizeCityScope(linked && linked.cityScope, this.getActiveCityScope());
            } else {
                config.cityScope = this.normalizeCityScope(this.getActiveCityScope(), 'ALL');
            }
        } else {
            config.cityScope = this.normalizeCityScope(config.cityScope, 'ALL');
        }
        const lockKey = this.resolveConfigLockKey(config, { configType });
        if (lockKey) {
            config.lockKey = lockKey;
        } else if (config.schedulePeriodConfigId) {
            config.lockKey = this.buildLockKey(config.schedulePeriodConfigId, config.cityScope);
        } else if (configType === 'schedulePeriod' && config.configId) {
            config.lockKey = this.buildLockKey(config.configId, config.cityScope);
        } else {
            config.lockKey = null;
        }
        if (!config.createdAt) {
            config.createdAt = now;
        }
        if (!config.createdByEmpNo) {
            config.createdByEmpNo = actorEmpNo;
        }
        config.updatedAt = options.keepUpdatedAt ? (config.updatedAt || now) : now;
        config.updatedByEmpNo = actorEmpNo;
        return config;
    },

    markConfigActivated(config, configType = null, actorEmpNo = null) {
        if (!config || typeof config !== 'object') return;
        config.activatedAt = new Date().toISOString();
        config.activatedByEmpNo = actorEmpNo || this.getCurrentEmpNo('SYSTEM');
        this.normalizeConfigMeta(config, configType, { actorEmpNo: config.activatedByEmpNo, keepUpdatedAt: false });
    },

    assertUniqueConfigPerLock(configType, configId) {
        if (!configType || !configId) return;
        const list = this.getConfigsByLockType(configType);
        const target = list.find((row) => row && row.configId === configId);
        if (!target) return;
        const targetLockKey = this.resolveConfigLockKey(target, { configType });
        if (!targetLockKey) return;
        const duplicates = list.filter((row) => {
            if (!row || row.configId === configId) return false;
            return this.resolveConfigLockKey(row, { configType }) === targetLockKey;
        });
        if (duplicates.length > 0) {
            throw new Error(`当前锁已存在${configType}配置：${duplicates[0].name || duplicates[0].configId}`);
        }
    },

    normalizeCityScope(scope, fallback = 'ALL') {
        if (typeof CityUtils !== 'undefined' && CityUtils.normalizeCityScope) {
            return CityUtils.normalizeCityScope(scope, fallback);
        }
        const value = String(scope == null ? '' : scope).trim().toUpperCase();
        if (value === 'SH' || value === 'CD' || value === 'ALL') return value;
        return fallback;
    },

    getActiveCityScope() {
        return this.normalizeCityScope(this.state.activeCityScope, 'ALL');
    },

    syncActiveCityScope(scope, fallback = 'ALL') {
        const restriction = this.getSchedulerCityScopeRestriction();
        this.state.activeCityScope = restriction || this.normalizeCityScope(scope, fallback);
        const session = this.getCurrentSession();
        if (session) {
            session.activeCityScope = this.state.activeCityScope;
            session.activeLockKey = this.buildLockKey(session.activePeriodId || this.state.activeSchedulePeriodConfigId, session.activeCityScope);
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('cityScopeChanged', { detail: { scope: this.state.activeCityScope } }));
        }
        return this.state.activeCityScope;
    },

    async setActiveCityScope(scope, autoSave = true) {
        this.syncActiveCityScope(scope, 'ALL');
        if (autoSave) {
            await this.saveState();
        }
    },

    buildLockKey(schedulePeriodConfigId, cityScope) {
        if (!schedulePeriodConfigId) return null;
        const scope = this.normalizeCityScope(cityScope, 'ALL');
        return `${String(schedulePeriodConfigId)}::${scope}`;
    },

    parseLockKey(lockKey) {
        if (!lockKey || typeof lockKey !== 'string') {
            return { schedulePeriodConfigId: null, cityScope: 'ALL' };
        }
        const parts = lockKey.split('::');
        if (parts.length !== 2) {
            return { schedulePeriodConfigId: null, cityScope: 'ALL' };
        }
        return {
            schedulePeriodConfigId: parts[0] || null,
            cityScope: this.normalizeCityScope(parts[1], 'ALL')
        };
    },

    getActiveLockContext() {
        const activePeriodId = this.state.activeSchedulePeriodConfigId || null;
        if (!activePeriodId) {
            return {
                valid: false,
                schedulePeriodConfigId: null,
                cityScope: this.getActiveCityScope(),
                lockKey: null,
                schedulePeriodConfig: null
            };
        }

        const periodConfig = this.getSchedulePeriodConfig(activePeriodId);
        if (!periodConfig) {
            return {
                valid: false,
                schedulePeriodConfigId: activePeriodId,
                cityScope: this.getActiveCityScope(),
                lockKey: null,
                schedulePeriodConfig: null
            };
        }

        const cityScope = this.normalizeCityScope(periodConfig.cityScope, this.getActiveCityScope());
        return {
            valid: true,
            schedulePeriodConfigId: activePeriodId,
            cityScope,
            lockKey: this.buildLockKey(activePeriodId, cityScope),
            schedulePeriodConfig: periodConfig
        };
    },

    findPeriodConfigIdByYearMonthScope(year, month, cityScope = 'ALL') {
        if (!year || !month) return null;
        const targetScope = this.normalizeCityScope(cityScope, 'ALL');
        const candidates = (this.state.schedulePeriodConfigs || []).filter((cfg) => {
            if (!cfg || !cfg.scheduleConfig) return false;
            const y = Number(cfg.scheduleConfig.year);
            const m = Number(cfg.scheduleConfig.month);
            if (!Number.isFinite(y) || !Number.isFinite(m)) return false;
            return y === Number(year)
                && m === Number(month)
                && this.normalizeCityScope(cfg.cityScope, 'ALL') === targetScope;
        });
        if (candidates.length === 1) {
            return candidates[0].configId;
        }
        return null;
    },

    inferSchedulePeriodConfigId(config, configType = null) {
        if (!config || typeof config !== 'object') return null;

        if (configType === 'schedulePeriod') {
            return config.configId || null;
        }

        if (config.schedulePeriodConfigId) {
            const linked = this.getSchedulePeriodConfig(config.schedulePeriodConfigId);
            if (linked) return config.schedulePeriodConfigId;
        }

        if (config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month) {
            const scopeFromConfig = (configType === 'staff')
                ? this.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL')
                : this.normalizeCityScope(config.cityScope, 'ALL');
            const matchedId = this.findPeriodConfigIdByYearMonthScope(
                config.scheduleConfig.year,
                config.scheduleConfig.month,
                scopeFromConfig
            );
            if (matchedId) return matchedId;
        }

        if (config.schedulePeriod && typeof config.schedulePeriod === 'string' && config.schedulePeriod.includes('至')) {
            const parts = config.schedulePeriod.split('至').map((s) => String(s || '').trim());
            if (parts.length === 2) {
                const [startDate, endDate] = parts;
                const scopeFromConfig = (configType === 'staff')
                    ? this.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL')
                    : this.normalizeCityScope(config.cityScope, 'ALL');
                const candidates = (this.state.schedulePeriodConfigs || []).filter((periodCfg) => {
                    if (!periodCfg || !periodCfg.scheduleConfig) return false;
                    return periodCfg.scheduleConfig.startDate === startDate
                        && periodCfg.scheduleConfig.endDate === endDate
                        && this.normalizeCityScope(periodCfg.cityScope, 'ALL') === scopeFromConfig;
                });
                if (candidates.length === 1) {
                    return candidates[0].configId;
                }
            }
        }

        if (configType === 'staff') {
            const scopeFromConfig = this.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL');
            const scopeCandidates = (this.state.schedulePeriodConfigs || []).filter((periodCfg) => {
                if (!periodCfg || typeof periodCfg !== 'object') return false;
                return this.normalizeCityScope(periodCfg.cityScope, 'ALL') === scopeFromConfig;
            });
            if (scopeCandidates.length === 1) {
                return scopeCandidates[0].configId;
            }
            const activePeriod = this.getActiveSchedulePeriodConfig();
            if (activePeriod && this.normalizeCityScope(activePeriod.cityScope, 'ALL') === scopeFromConfig) {
                return activePeriod.configId;
            }
        }

        return null;
    },

    resolveConfigLockKey(config, options = {}) {
        if (!config || typeof config !== 'object') return null;
        const configType = options.configType || null;

        const periodId = this.inferSchedulePeriodConfigId(config, configType);
        if (!periodId) return null;

        let scope = this.normalizeCityScope(config.cityScope, 'ALL');
        if (configType === 'staff') {
            scope = this.getStaffConfigEffectiveCityScope(config, scope);
        } else if (!config.cityScope) {
            const periodCfg = this.getSchedulePeriodConfig(periodId);
            if (periodCfg) {
                scope = this.normalizeCityScope(periodCfg.cityScope, scope);
            }
        }

        return this.buildLockKey(periodId, scope);
    },

    isConfigInActiveLock(config, options = {}) {
        const activeLock = this.getActiveLockContext();
        if (!activeLock.valid || !activeLock.lockKey) return false;
        const configLockKey = this.resolveConfigLockKey(config, options);
        return !!configLockKey && configLockKey === activeLock.lockKey;
    },

    tryAutoBindConfigToActiveLock(config, options = {}) {
        const activeLock = this.getActiveLockContext();
        if (!activeLock.valid || !activeLock.schedulePeriodConfigId || !config || typeof config !== 'object') {
            return false;
        }
        const configType = options.configType || null;
        if (config.schedulePeriodConfigId && config.schedulePeriodConfigId !== activeLock.schedulePeriodConfigId) {
            return false;
        }

        let configScope = this.normalizeCityScope(config.cityScope, 'ALL');
        if (configType === 'staff') {
            configScope = this.getStaffConfigEffectiveCityScope(config, configScope);
        }
        const activeScope = this.normalizeCityScope(activeLock.cityScope, 'ALL');
        if (configScope !== activeScope) {
            return false;
        }

        config.schedulePeriodConfigId = activeLock.schedulePeriodConfigId;
        config.cityScope = activeScope;
        config.updatedAt = new Date().toISOString();
        return true;
    },

    ensureLockProfilesShape() {
        if (!this.state.ruleConfigProfiles || typeof this.state.ruleConfigProfiles !== 'object') {
            this.state.ruleConfigProfiles = {};
        }
        if (!this.state.minimumManpowerProfiles || typeof this.state.minimumManpowerProfiles !== 'object') {
            this.state.minimumManpowerProfiles = {};
        }
    },

    getMinimumManpowerConfigForLock(lockKey) {
        this.ensureLockProfilesShape();
        if (!lockKey) return null;
        const cfg = this.state.minimumManpowerProfiles[lockKey];
        return cfg ? this.deepClone(cfg) : null;
    },

    getMinimumManpowerConfigForActiveLock() {
        const activeLock = this.getActiveLockContext();
        if (!activeLock.valid) return null;
        return this.getMinimumManpowerConfigForLock(activeLock.lockKey);
    },

    setMinimumManpowerConfigForLock(lockKey, config, autoSave = true) {
        this.ensureLockProfilesShape();
        if (!lockKey) return;
        const lock = this.parseLockKey(lockKey);
        const next = this.deepClone(config || {});
        next.schedulePeriodConfigId = lock.schedulePeriodConfigId;
        next.cityScope = lock.cityScope;
        this.state.minimumManpowerProfiles[lockKey] = next;
        if (autoSave) {
            this.saveState();
        }
    },

    setMinimumManpowerConfigForActiveLock(config, autoSave = true, enforcePermission = true) {
        const activeLock = this.getActiveLockContext();
        if (!activeLock.valid || !activeLock.lockKey) return;
        if (enforcePermission) {
            this.assertCanMutate('minimumManpower', 'edit', { cityScope: activeLock.cityScope });
        }
        this.setMinimumManpowerConfigForLock(activeLock.lockKey, config, false);
        this.state.minimumManpowerConfig = this.deepClone(config || {});
        if (autoSave) {
            this.saveState();
        }
    },

    getRuleConfigProfile(lockKey) {
        this.ensureLockProfilesShape();
        if (!lockKey) return null;
        const profile = this.state.ruleConfigProfiles[lockKey];
        return profile ? this.deepClone(profile) : null;
    },

    getRuleConfigProfileForActiveLock() {
        const activeLock = this.getActiveLockContext();
        if (!activeLock.valid) return null;
        return this.getRuleConfigProfile(activeLock.lockKey);
    },

    setRuleConfigProfile(lockKey, profile, autoSave = true) {
        this.ensureLockProfilesShape();
        if (!lockKey) return;
        const lock = this.parseLockKey(lockKey);
        const next = this.deepClone(profile || {});
        next.schedulePeriodConfigId = lock.schedulePeriodConfigId;
        next.cityScope = lock.cityScope;
        next.updatedAt = new Date().toISOString();
        this.state.ruleConfigProfiles[lockKey] = next;
        if (autoSave) {
            this.saveState();
        }
    },

    setRuleConfigProfileForActiveLock(profile, autoSave = true, enforcePermission = true) {
        const activeLock = this.getActiveLockContext();
        if (!activeLock.valid || !activeLock.lockKey) return;
        if (enforcePermission) {
            this.assertCanMutate('ruleConfig', 'edit', { cityScope: activeLock.cityScope });
        }
        this.setRuleConfigProfile(activeLock.lockKey, profile, autoSave);
    },

    inferStaffSnapshotCityScope(snapshot, fallback = 'ALL') {
        if (!Array.isArray(snapshot) || snapshot.length === 0) {
            return this.normalizeCityScope(fallback, 'ALL');
        }
        const scopes = snapshot.map((staff) => {
            const normalized = this.normalizeStaffCityFields(staff || {});
            return this.normalizeCityScope(normalized && normalized.city, 'SH');
        });
        const uniqueScopes = Array.from(new Set(scopes));
        if (uniqueScopes.length === 1) return uniqueScopes[0];
        return 'ALL';
    },

    getStaffConfigEffectiveCityScope(config, fallback = 'ALL') {
        if (!config || typeof config !== 'object') {
            return this.normalizeCityScope(fallback, 'ALL');
        }
        const hasDeclaredScope = config.cityScope !== undefined
            && config.cityScope !== null
            && String(config.cityScope).trim() !== '';
        if (hasDeclaredScope) {
            return this.normalizeCityScope(config.cityScope, fallback);
        }
        return this.inferStaffSnapshotCityScope(config.staffDataSnapshot || [], fallback);
    },

    filterStaffByCityScope(staffList, scope = 'ALL') {
        const normalizedScope = this.normalizeCityScope(scope, 'ALL');
        const list = Array.isArray(staffList) ? staffList : [];
        if (normalizedScope === 'ALL') {
            return list.map((staff) => this.normalizeStaffCityFields(staff || {}));
        }
        return list
            .map((staff) => this.normalizeStaffCityFields(staff || {}))
            .filter((staff) => this.normalizeCityScope(staff && staff.city, 'SH') === normalizedScope);
    },

    enforceActiveLockConsistency(targetContext = null) {
        const activeLock = targetContext && typeof targetContext === 'object'
            ? targetContext
            : this.getActiveLockContext();
        if (!activeLock || !activeLock.valid || !activeLock.lockKey) {
            return false;
        }
        let changed = false;

        const clearWhenMismatch = (stateKey, config, resolveOptions = {}, onClear = null) => {
            const activeId = this.state[stateKey];
            if (!activeId) return;
            if (!config) {
                this.state[stateKey] = null;
                if (typeof onClear === 'function') onClear();
                changed = true;
                return;
            }
            const lockKey = this.resolveConfigLockKey(config, resolveOptions);
            if (!lockKey || lockKey !== activeLock.lockKey) {
                this.state[stateKey] = null;
                if (typeof onClear === 'function') onClear();
                changed = true;
            }
        };

        clearWhenMismatch(
            'activeConfigId',
            this.getStaffConfig(this.state.activeConfigId),
            { configType: 'staff' }
        );

        clearWhenMismatch(
            'activeRequestConfigId',
            this.getRequestConfig(this.state.activeRequestConfigId),
            { configType: 'request' },
            () => {
                this.state.personalRequests = {};
            }
        );

        clearWhenMismatch(
            'activeFullRestConfigId',
            this.getFullRestConfig(this.state.activeFullRestConfigId),
            { configType: 'fullRest' }
        );

        clearWhenMismatch(
            'activeMonthlyShiftConfigId',
            this.getMonthlyShiftConfig(this.state.activeMonthlyShiftConfigId),
            { configType: 'monthlyShift' }
        );

        clearWhenMismatch(
            'activeMonthlyScheduleConfigId',
            this.getMonthlyScheduleConfig(this.state.activeMonthlyScheduleConfigId),
            { configType: 'monthlySchedule' }
        );

        if (this.state.activeDailyManpowerConfigId) {
            // 每日人力配置独立存储于IndexedDB，锁切换时保守清空激活态，避免串锁编辑。
            this.state.activeDailyManpowerConfigId = null;
            changed = true;
        }

        clearWhenMismatch(
            'activeNightShiftConfigId',
            this.getNightShiftConfig(this.state.activeNightShiftConfigId),
            { configType: 'nightShift' }
        );

        clearWhenMismatch(
            'activeScheduleResultConfigId',
            this.getScheduleResultConfig(this.state.activeScheduleResultConfigId),
            { configType: 'scheduleResult' },
            () => {
                this.state.finalSchedule = null;
            }
        );

        return changed;
    },

    enforceActiveCityScopeConsistency(targetScope = null) {
        const active = this.getActiveLockContext();
        const normalizedScope = this.normalizeCityScope(targetScope || active.cityScope || this.getActiveCityScope(), 'ALL');
        const targetLock = (active && active.schedulePeriodConfigId)
            ? {
                valid: true,
                schedulePeriodConfigId: active.schedulePeriodConfigId,
                cityScope: normalizedScope,
                lockKey: this.buildLockKey(active.schedulePeriodConfigId, normalizedScope)
            }
            : active;
        return this.enforceActiveLockConsistency(targetLock);
    },

    getLockManagedConfigTypeDefs() {
        return [
            { type: 'staff', stateKey: 'staffConfigs', activeStateKey: 'activeConfigId', label: '人员配置' },
            { type: 'request', stateKey: 'requestConfigs', activeStateKey: 'activeRequestConfigId', label: '个性化休假配置' },
            { type: 'fullRest', stateKey: 'fullRestConfigs', activeStateKey: 'activeFullRestConfigId', label: '全量休息配置' },
            { type: 'monthlyShift', stateKey: 'monthlyShiftConfigs', activeStateKey: 'activeMonthlyShiftConfigId', label: '月度班次配置' },
            { type: 'monthlySchedule', stateKey: 'monthlyScheduleConfigs', activeStateKey: 'activeMonthlyScheduleConfigId', label: '本月排班配置' },
            { type: 'nightShift', stateKey: 'nightShiftConfigs', activeStateKey: 'activeNightShiftConfigId', label: '大夜配置' },
            { type: 'scheduleResult', stateKey: 'scheduleResultConfigs', activeStateKey: 'activeScheduleResultConfigId', label: '排班结果配置' }
        ];
    },

    getConfigsByLockType(configType) {
        const defs = this.getLockManagedConfigTypeDefs();
        const def = defs.find((item) => item.type === configType);
        if (!def) return [];
        const list = this.state[def.stateKey];
        return Array.isArray(list) ? list : [];
    },

    getUnboundArchiveConfigs() {
        const defs = this.getLockManagedConfigTypeDefs();
        const rows = [];
        defs.forEach((def) => {
            const list = this.getConfigsByLockType(def.type);
            list.forEach((config) => {
                if (!config || typeof config !== 'object') return;
                const inferredPeriodId = this.inferSchedulePeriodConfigId(config, def.type);
                const hasBoundPeriod = !!(config.schedulePeriodConfigId || inferredPeriodId);
                const isUnbound = !!config.unboundArchive || !hasBoundPeriod;
                if (!isUnbound) return;
                const cityScope = (def.type === 'staff')
                    ? this.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL')
                    : this.normalizeCityScope(config.cityScope, 'ALL');
                if (!this.canCurrentUserViewScope(cityScope)) return;
                rows.push({
                    configType: def.type,
                    configTypeLabel: def.label,
                    configId: config.configId,
                    name: config.name || config.configId || '未命名配置',
                    cityScope,
                    schedulePeriodConfigId: config.schedulePeriodConfigId || null,
                    createdAt: config.createdAt || null,
                    updatedAt: config.updatedAt || null,
                    unboundArchive: true
                });
            });
        });
        rows.sort((a, b) => {
            const ta = a.updatedAt ? Date.parse(a.updatedAt) : (a.createdAt ? Date.parse(a.createdAt) : 0);
            const tb = b.updatedAt ? Date.parse(b.updatedAt) : (b.createdAt ? Date.parse(b.createdAt) : 0);
            return tb - ta;
        });
        return rows;
    },

    bindUnboundArchiveToSchedulePeriod(configType, configId, schedulePeriodConfigId, options = {}) {
        const defs = this.getLockManagedConfigTypeDefs();
        const def = defs.find((item) => item.type === configType);
        if (!def) {
            return { updated: false, reason: 'unknown_config_type', configType, configId };
        }
        const periodCfg = this.getSchedulePeriodConfig(schedulePeriodConfigId);
        if (!periodCfg) {
            return { updated: false, reason: 'period_not_found', configType, configId };
        }
        const list = this.getConfigsByLockType(configType);
        const target = list.find((item) => item && item.configId === configId);
        if (!target) {
            return { updated: false, reason: 'config_not_found', configType, configId };
        }

        const strictScope = options.strictScope !== false;
        const targetScope = this.normalizeCityScope(periodCfg.cityScope, 'ALL');
        const currentScope = (configType === 'staff')
            ? this.getStaffConfigEffectiveCityScope(target, target.cityScope || 'ALL')
            : this.normalizeCityScope(target.cityScope, 'ALL');
        if (strictScope && currentScope !== targetScope) {
            return {
                updated: false,
                reason: 'scope_mismatch',
                configType,
                configId,
                configScope: currentScope,
                periodScope: targetScope
            };
        }

        target.schedulePeriodConfigId = schedulePeriodConfigId;
        target.cityScope = targetScope;
        if (target.unboundArchive) {
            delete target.unboundArchive;
        }
        target.updatedAt = new Date().toISOString();
        return {
            updated: true,
            configType,
            configId,
            configScope: targetScope,
            schedulePeriodConfigId
        };
    },

    bindUnboundArchivesToSchedulePeriod(schedulePeriodConfigId, options = {}) {
        const periodCfg = this.getSchedulePeriodConfig(schedulePeriodConfigId);
        if (!periodCfg) {
            return {
                targetSchedulePeriodConfigId: schedulePeriodConfigId,
                targetScope: null,
                strictScope: options.strictScope !== false,
                onlySameScope: options.onlySameScope !== false,
                total: 0,
                bound: 0,
                skipped: 0,
                details: [{ updated: false, reason: 'period_not_found', schedulePeriodConfigId }]
            };
        }
        const targetScope = this.normalizeCityScope(periodCfg.cityScope, 'ALL');
        const onlySameScope = options.onlySameScope !== false;
        const unboundListAll = this.getUnboundArchiveConfigs();
        const unboundList = onlySameScope
            ? unboundListAll.filter((row) => this.normalizeCityScope(row.cityScope, 'ALL') === targetScope)
            : unboundListAll;
        const strictScope = options.strictScope !== false;
        const autoSave = options.autoSave !== false;
        const results = {
            targetSchedulePeriodConfigId: schedulePeriodConfigId,
            targetScope,
            strictScope,
            onlySameScope,
            total: unboundList.length,
            bound: 0,
            skipped: 0,
            details: []
        };

        unboundList.forEach((row) => {
            const result = this.bindUnboundArchiveToSchedulePeriod(
                row.configType,
                row.configId,
                schedulePeriodConfigId,
                { strictScope }
            );
            results.details.push(result);
            if (result.updated) {
                results.bound += 1;
            } else {
                results.skipped += 1;
            }
        });

        if (results.bound > 0) {
            this.enforceActiveLockConsistency();
            if (autoSave) {
                this.saveState();
            }
        }
        return results;
    },

    /**
     * 深拷贝对象（使用 structuredClone 或回退到 JSON 方法）
     * @param {*} obj - 要拷贝的对象
     * @returns {*} 深拷贝后的对象
     */
    deepClone(obj) {
        // 优先使用原生 structuredClone API（支持更多数据类型）
        if (typeof structuredClone !== 'undefined') {
            try {
                return structuredClone(obj);
            } catch (e) {
                // 如果 structuredClone 失败，回退到 JSON 方法
            }
        }
        // 回退到 JSON.parse(JSON.stringify())
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * 获取当前有效的人员数据列表
     * @returns {Array} 当前有效的人员数据数组
     */
    getCurrentStaffData() {
        const now = new Date().toISOString();
        const staffList = [];
        
        Object.keys(this.state.staffDataHistory).forEach(staffId => {
            const history = this.state.staffDataHistory[staffId];
            const latest = history.reduce((currentLatest, record) => {
                if (!record.isValid) {
                    return currentLatest;
                }
                if (record.expiresAt && record.expiresAt < now) {
                    return currentLatest;
                }
                if (!currentLatest) {
                    return record;
                }
                return new Date(record.createdAt) > new Date(currentLatest.createdAt)
                    ? record
                    : currentLatest;
            }, null);
            
            if (latest) {
                const normalizedData = this.normalizeStaffCityFields(latest.data || {});
                staffList.push({
                    ...normalizedData,
                    staffId: staffId,
                    versionId: latest.versionId,
                    createdAt: latest.createdAt,
                    expiresAt: latest.expiresAt
                });
            }
        });
        
        return staffList;
    },

    /**
     * 获取指定人员的历史记录
     * @param {string} staffId - 人员ID
     * @returns {Array} 历史记录数组
     */
    getStaffHistory(staffId) {
        return this.state.staffDataHistory[staffId] || [];
    },

    /**
     * 获取指定人员的当前有效数据
     * @param {string} staffId - 人员ID
     * @returns {Object|null} 人员数据对象，如果不存在返回 null
     */
    getStaffData(staffId) {
        const allStaff = this.getCurrentStaffData();
        return allStaff.find(staff => (staff.staffId || staff.id) === staffId) || null;
    },

    /**
     * 添加或更新人员数据（创建新版本）
     * @param {Object} staffData - 人员数据对象
     * @param {string} expiresAt - 失效时间（ISO字符串，可选）
     * @returns {string} 版本ID
     */
    addStaffData(staffData, expiresAt = null, autoSave = false) {
        const normalizedStaffData = this.normalizeStaffCityFields(staffData);
        const staffId = normalizedStaffData.id;
        if (!staffId) {
            throw new Error('人员数据必须包含ID');
        }

        // 如果不存在，创建空数组
        if (!this.state.staffDataHistory[staffId]) {
            this.state.staffDataHistory[staffId] = [];
        }

        // 生成版本ID
        const versionId = `v${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        // 使旧版本失效（如果上传新数据）
        if (expiresAt === null) {
            // 默认：新数据上传时，旧数据自动失效
            this.state.staffDataHistory[staffId].forEach(record => {
                if (record.isValid && (!record.expiresAt || record.expiresAt > now)) {
                    record.isValid = false;
                }
            });
        }

        // 添加新记录
        const newRecord = {
            data: { ...normalizedStaffData },
            createdAt: now,
            expiresAt: expiresAt,
            isValid: true,
            versionId: versionId
        };

        this.state.staffDataHistory[staffId].push(newRecord);

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }

        return versionId;
    },

    /**
     * 批量添加人员数据（从Excel导入）
     * @param {Array<Object>} staffList - 人员数据数组
     * @param {string} expiresAt - 失效时间（ISO字符串，可选）
     */
    batchAddStaffData(staffList, expiresAt = null) {
        const now = new Date().toISOString();
        const versionId = `batch_${Date.now()}`;

        staffList.forEach(staff => {
            const normalizedStaff = this.normalizeStaffCityFields(staff);
            const staffId = normalizedStaff.id;
            if (!staffId) return;

            // 如果不存在，创建空数组
            if (!this.state.staffDataHistory[staffId]) {
                this.state.staffDataHistory[staffId] = [];
            }

            // 使旧版本失效（如果上传新数据且未指定失效时间）
            if (expiresAt === null) {
                this.state.staffDataHistory[staffId].forEach(record => {
                    if (record.isValid && (!record.expiresAt || record.expiresAt > now)) {
                        record.isValid = false;
                    }
                });
            }

            // 添加新记录
            const newRecord = {
                data: { ...normalizedStaff },
                createdAt: now,
                expiresAt: expiresAt,
                isValid: true,
                versionId: `${versionId}_${staffId}`
            };

            this.state.staffDataHistory[staffId].push(newRecord);
        });

        this.saveState();
    },

    /**
     * 更新历史记录
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {Object} updates - 要更新的数据
     * @param {string} expiresAt - 新的失效时间（可选）
     */
    updateStaffHistory(staffId, versionId, updates, expiresAt = null, autoSave = false) {
        if (!this.state.staffDataHistory[staffId]) {
            throw new Error('人员不存在');
        }

        const record = this.state.staffDataHistory[staffId].find(r => r.versionId === versionId);
        if (!record) {
            throw new Error('版本记录不存在');
        }

        // 更新数据
        Object.assign(record.data, updates);
        record.data = this.normalizeStaffCityFields(record.data);

        // 更新失效时间
        if (expiresAt !== null) {
            record.expiresAt = expiresAt;
        }

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 设置历史记录的失效时间
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {string} expiresAt - 失效时间（ISO字符串）
     */
    setHistoryExpiresAt(staffId, versionId, expiresAt, autoSave = false) {
        if (!this.state.staffDataHistory[staffId]) {
            throw new Error('人员不存在');
        }

        const record = this.state.staffDataHistory[staffId].find(r => r.versionId === versionId);
        if (!record) {
            throw new Error('版本记录不存在');
        }

        record.expiresAt = expiresAt;

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 创建新的配置记录
     * @param {string} name - 配置名称（可选，默认自动生成）
     * @returns {string} 配置ID
     */
    createStaffConfig(name = null, cityScope = null, schedulePeriodConfigId = null) {
        const now = new Date();
        const configId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const linkedPeriodId = schedulePeriodConfigId || this.state.activeSchedulePeriodConfigId || null;
        const linkedPeriod = linkedPeriodId ? this.getSchedulePeriodConfig(linkedPeriodId) : null;
        const resolvedScope = this.normalizeCityScope(
            cityScope || (linkedPeriod && linkedPeriod.cityScope) || this.getActiveCityScope(),
            'ALL'
        );
        this.assertCanMutate('staff', 'create', { cityScope: resolvedScope });
        const targetLockKey = this.buildLockKey(linkedPeriodId, resolvedScope);
        const duplicatedScope = (this.state.staffConfigs || []).find((config) => {
            if (!config || typeof config !== 'object') return false;
            if (targetLockKey) {
                return this.resolveConfigLockKey(config, { configType: 'staff' }) === targetLockKey;
            }
            return this.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL') === resolvedScope;
        });
        if (duplicatedScope) {
            throw new Error(`当前锁已存在人员配置：${duplicatedScope.name}`);
        }
        
        // 生成默认名称：使用排班周期的结束月份作为前缀，保留时间戳后缀
        // 格式：YYYYMM_人员配置_YYMMDD_HHMMSS（使用排班周期的结束月份 + 当前时间戳）
        if (!name) {
            const scheduleConfig = this.state.scheduleConfig;
            let year, month;
            
            // 如果有排班周期配置，使用排班周期的结束月份
            if (scheduleConfig && scheduleConfig.endDate) {
                const scheduleEndDate = new Date(scheduleConfig.endDate);
                year = scheduleEndDate.getFullYear();
                month = String(scheduleEndDate.getMonth() + 1).padStart(2, '0');
            } else {
                // 如果没有排班周期配置，使用当前日期
                year = now.getFullYear();
                month = String(now.getMonth() + 1).padStart(2, '0');
            }
            
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');
            const createYear = now.getFullYear();
            const createMonth = String(now.getMonth() + 1).padStart(2, '0');
            // 格式：YYYYMM-人员配置-YYYYMMDD-HHmmss（排班周期年月-人员配置-创建时间）
            name = `${year}${month}-人员配置-${createYear}${createMonth}${day}-${hour}${minute}${second}`;
        }

        // 获取当前人员数据快照（按城市范围裁剪，确保与配置范围严格一致）
        const currentStaff = this.filterStaffByCityScope(this.getCurrentStaffData(), resolvedScope);
        
        const config = {
            configId: configId,
            name: name,
            staffDataSnapshot: JSON.parse(JSON.stringify(currentStaff)), // 深拷贝
            cityScope: resolvedScope,
            schedulePeriodConfigId: linkedPeriodId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        this.state.staffConfigs.push(config);
        this.state.activeConfigId = configId;
        this.syncActiveCityScope(resolvedScope, this.getActiveCityScope());
        this.saveState();

        return configId;
    },

    /**
     * 获取所有配置记录
     * @returns {Array} 配置记录数组
     */
    getStaffConfigs(options = {}) {
        if (!Array.isArray(this.state.staffConfigs)) {
            this.state.staffConfigs = [];
        }
        if (options && options.raw === true) {
            return this.state.staffConfigs;
        }
        return this.filterConfigsByCurrentUserScope(this.state.staffConfigs, 'staff');
    },

    /**
     * 获取指定配置记录
     * @param {string} configId - 配置ID
     * @returns {Object} 配置记录
     */
    getStaffConfig(configId) {
        return this.state.staffConfigs.find(c => c.configId === configId);
    },

    /**
     * 更新配置记录
     * @param {string} configId - 配置ID
     * @param {Object} updates - 更新内容
     */
    updateStaffConfig(configId, updates, autoSave = false) {
        const config = this.state.staffConfigs.find(c => c.configId === configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }

        // 更新配置
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();

        // 如果更新了人员数据，更新快照
        if (updates.staffDataSnapshot) {
            config.staffDataSnapshot = JSON.parse(JSON.stringify(updates.staffDataSnapshot));
        }

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除配置记录（允许删除激活状态的配置，如果是最后一条会自动取消激活）
     * @param {string} configId - 配置ID
     */
    deleteStaffConfig(configId) {
        const config = this.getStaffConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }

        // 如果是激活状态的配置，先取消激活
        if (this.state.activeConfigId === configId) {
            this.state.activeConfigId = null;
        }

        const index = this.state.staffConfigs.findIndex(c => c.configId === configId);
        this.state.staffConfigs.splice(index, 1);
        this.saveState();
    },

    /**
     * 复制配置记录
     * @param {string} configId - 要复制的配置ID
     * @param {string} newName - 新配置名称（可选）
     * @returns {string} 新配置ID
     */
    duplicateStaffConfig(configId, newName = null) {
        const sourceConfig = this.getStaffConfig(configId);
        if (!sourceConfig) {
            throw new Error('配置记录不存在');
        }
        const sourceScope = this.getStaffConfigEffectiveCityScope(sourceConfig, sourceConfig.cityScope || 'ALL');
        const sourcePeriodId = this.inferSchedulePeriodConfigId(sourceConfig, 'staff');
        const sourceLockKey = this.buildLockKey(sourcePeriodId, sourceScope);
        const duplicatedScope = (this.state.staffConfigs || []).find((config) => {
            if (!config || config.configId === configId) return false;
            if (sourceLockKey) {
                return this.resolveConfigLockKey(config, { configType: 'staff' }) === sourceLockKey;
            }
            return this.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL') === sourceScope;
        });
        if (duplicatedScope) {
            throw new Error(`当前锁已存在人员配置：${duplicatedScope.name}`);
        }

        const now = new Date();
        const newConfigId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!newName) {
            newName = `${sourceConfig.name} (副本)`;
        }

        const newConfig = {
            configId: newConfigId,
            name: newName,
            staffDataSnapshot: JSON.parse(JSON.stringify(sourceConfig.staffDataSnapshot)), // 深拷贝
            cityScope: sourceScope,
            schedulePeriodConfigId: sourcePeriodId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        this.state.staffConfigs.push(newConfig);
        // 复制后的配置自动为非激活状态（不设置activeConfigId）
        this.saveState();

        return newConfigId;
    },

    /**
     * 设置激活的配置（自动将其他设置为非激活）
     * 加载配置快照到当前工作状态
     * @param {string} configId - 配置ID
     */
    async setActiveConfig(configId) {
        const config = this.getStaffConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        if (activeLock.valid && !this.isConfigInActiveLock(config, { configType: 'staff' })) {
            const autoBound = this.tryAutoBindConfigToActiveLock(config, { configType: 'staff' });
            if (!autoBound || !this.isConfigInActiveLock(config, { configType: 'staff' })) {
                throw new Error('人员配置与当前激活的城市+周期不一致，无法激活');
            }
        }

        // 确保只有一个激活：将当前激活的设置为非激活
        this.state.activeConfigId = configId;
        this.syncActiveCityScope(this.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL'), this.getActiveCityScope());

        // 加载配置的人员数据快照到工作状态
        // 与 setActiveRequestConfig 和 setActiveSchedulePeriodConfig 保持一致
        if (config.staffDataSnapshot && Array.isArray(config.staffDataSnapshot)) {
            const now = new Date().toISOString();

            // 将快照中的每个人员数据作为新版本添加到 staffDataHistory
            config.staffDataSnapshot.forEach(staffData => {
                const staffId = staffData.id;
                if (!staffId) return;

                // 如果不存在，创建空数组
                if (!this.state.staffDataHistory[staffId]) {
                    this.state.staffDataHistory[staffId] = [];
                }

                // 使旧版本失效
                this.state.staffDataHistory[staffId].forEach(record => {
                    if (record.isValid && (!record.expiresAt || record.expiresAt > now)) {
                        record.isValid = false;
                    }
                });

                // 生成版本ID
                const versionId = `config_${configId}_${staffId}_${Date.now()}`;

                // 添加新记录（从快照恢复）
                const newRecord = {
                    data: { ...staffData },
                    createdAt: now,
                    expiresAt: null, // 激活的配置永不过期
                    isValid: true,
                    versionId: versionId,
                    sourceConfigId: configId // 记录来源配置
                };

                this.state.staffDataHistory[staffId].push(newRecord);
            });

            console.log(`setActiveConfig: 已加载配置 ${config.name} 的人员数据快照，包含 ${config.staffDataSnapshot.length} 个人员`);
        } else {
            console.warn(`setActiveConfig: 配置 ${config.name} 没有有效的人员数据快照`);
        }

        // 等待保存完成，确保激活状态被持久化
        await this.saveState();
    },

    /**
     * 取消激活人员配置
     */
    async clearActiveConfig() {
        this.state.activeConfigId = null;
        await this.saveState();
    },

    /**
     * 设置状态
     * @param {string} key - 状态键名
     * @param {*} value - 状态值
     */
    setState(key, value) {
        this.state[key] = value;
        // 状态变更后自动保存
        this.saveState();
    },

    /**
     * 更新状态（部分更新）
     * @param {Object} updates - 要更新的键值对
     */
    updateState(updates, autoSave = true) {
        if (updates && Object.prototype.hasOwnProperty.call(updates, 'minimumManpowerConfig')) {
            const activeLock = this.getActiveLockContext();
            if (activeLock && activeLock.valid && activeLock.lockKey) {
                this.setMinimumManpowerConfigForLock(activeLock.lockKey, updates.minimumManpowerConfig, false);
            }
        }
        Object.assign(this.state, updates);
        // 状态变更后自动保存（除非明确指定不保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 设置个人休假需求
     * @param {string} staffId - 人员ID
     * @param {string} date - 日期（YYYY-MM-DD格式）
     * @param {string} status - 休假类型：'ANNUAL'(年假), 'LEGAL'(法定休), 'REQ'(自动判断), ''(取消)
     */
    setPersonalRequest(staffId, date, status) {
        if (!this.state.personalRequests[staffId]) {
            this.state.personalRequests[staffId] = {};
        }

        // 支持多种休假类型：ANNUAL, LEGAL, REQ
        if (status && status !== '') {
            // 设置休假类型
            this.state.personalRequests[staffId][date] = status;
        } else {
            // 删除该日期的请求
            delete this.state.personalRequests[staffId][date];
            // 如果该员工没有任何请求了，删除整个对象
            if (Object.keys(this.state.personalRequests[staffId]).length === 0) {
                delete this.state.personalRequests[staffId];
            }
        }

        this.saveState();
    },

    /**
     * 批量设置个人休假需求
     * @param {string} staffId - 人员ID
     * @param {Object} requests - 休假需求对象，格式：{ "YYYY-MM-DD": "REQ", ... }
     */
    setPersonalRequests(staffId, requests) {
        this.state.personalRequests[staffId] = requests || {};
        this.saveState();
    },

    /**
     * 获取个人休假需求
     * @param {string} staffId - 人员ID
     * @returns {Object} 休假需求对象
     */
    getPersonalRequests(staffId) {
        return this.state.personalRequests[staffId] || {};
    },

    /**
     * 获取所有个人休假需求
     * @returns {Object} 所有人员的休假需求
     */
    getAllPersonalRequests() {
        return this.state.personalRequests || {};
    },

    /**
     * 获取个性化需求配置列表
     */
    getRequestConfigs(options = {}) {
        if (!Array.isArray(this.state.requestConfigs)) {
            this.state.requestConfigs = [];
        }
        if (options && options.raw === true) {
            return this.state.requestConfigs;
        }
        return this.filterConfigsByCurrentUserScope(this.state.requestConfigs, 'request');
    },

    /**
     * 获取指定需求配置
     */
    getRequestConfig(configId) {
        return (this.state.requestConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建个性化需求配置
     */
    createRequestConfig(name, personalRequests, restDays = {}, cityScope = null, schedulePeriodConfigId = null) {
        const now = new Date();
        const configId = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const requestConfigs = this.getRequestConfigs({ raw: true });
        const linkedPeriodId = schedulePeriodConfigId || this.state.activeSchedulePeriodConfigId || null;
        const linkedPeriod = linkedPeriodId ? this.getSchedulePeriodConfig(linkedPeriodId) : null;
        const newConfig = {
            configId,
            name,
            personalRequestsSnapshot: JSON.parse(JSON.stringify(personalRequests || {})),
            restDaysSnapshot: JSON.parse(JSON.stringify(restDays || {})),
            cityScope: this.normalizeCityScope(cityScope || (linkedPeriod && linkedPeriod.cityScope) || this.getActiveCityScope(), 'ALL'),
            schedulePeriodConfigId: linkedPeriodId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.assertCanMutate('request', 'create', { cityScope: newConfig.cityScope });
        requestConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新需求配置
     */
    updateRequestConfig(configId, updates, autoSave = false) {
        const config = this.getRequestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();
        
        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除需求配置
     */
    deleteRequestConfig(configId) {
        const config = this.getRequestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        if (this.state.activeRequestConfigId === configId) {
            this.state.activeRequestConfigId = null;
        }
        this.state.requestConfigs = (this.state.requestConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
    },

    /**
     * 复制需求配置
     */
    duplicateRequestConfig(configId, newName = null) {
        const source = this.getRequestConfig(configId);
        if (!source) {
            throw new Error('配置记录不存在');
        }
        const now = new Date();
        const newConfigId = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const copy = {
            configId: newConfigId,
            name: newName || `${source.name} (副本)`,
            personalRequestsSnapshot: JSON.parse(JSON.stringify(source.personalRequestsSnapshot || {})),
            restDaysSnapshot: JSON.parse(JSON.stringify(source.restDaysSnapshot || {})),
            cityScope: this.normalizeCityScope(source.cityScope, 'ALL'),
            schedulePeriodConfigId: this.inferSchedulePeriodConfigId(source, 'request'),
            schedulePeriod: source.schedulePeriod || null,
            scheduleConfig: source.scheduleConfig ? JSON.parse(JSON.stringify(source.scheduleConfig)) : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.requestConfigs.push(copy);
        this.saveState();
        return newConfigId;
    },

    /**
     * 设置激活需求配置
     */
    async setActiveRequestConfig(configId) {
        const config = this.getRequestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        if (activeLock.valid && !this.isConfigInActiveLock(config, { configType: 'request' })) {
            const autoBound = this.tryAutoBindConfigToActiveLock(config, { configType: 'request' });
            if (!autoBound || !this.isConfigInActiveLock(config, { configType: 'request' })) {
                throw new Error('个性化休假配置与当前激活的城市+周期不一致，无法激活');
            }
        }
        this.state.activeRequestConfigId = configId;
        this.syncActiveCityScope(config.cityScope, this.getActiveCityScope());
        this.state.personalRequests = JSON.parse(JSON.stringify(config.personalRequestsSnapshot || {}));
        this.state.restDays = JSON.parse(JSON.stringify(config.restDaysSnapshot || {}));
        // 等待保存完成，确保激活状态被持久化
        await this.saveState();
    },

    /**
     * 取消激活需求配置
     */
    async clearActiveRequestConfig() {
        this.state.activeRequestConfigId = null;
        this.state.personalRequests = {};

        // 恢复为当前激活排班周期的休息日，避免残留个性化配置快照
        const activeSchedulePeriodConfig = this.getActiveSchedulePeriodConfig();
        if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.restDaysSnapshot) {
            this.state.restDays = JSON.parse(JSON.stringify(activeSchedulePeriodConfig.restDaysSnapshot));
        }

        await this.saveState();
    },

    /**
     * 获取排班周期配置列表
     */
    getSchedulePeriodConfigs(options = {}) {
        if (!Array.isArray(this.state.schedulePeriodConfigs)) {
            this.state.schedulePeriodConfigs = [];
        }
        if (options && options.raw === true) {
            return this.state.schedulePeriodConfigs;
        }
        return this.filterConfigsByCurrentUserScope(this.state.schedulePeriodConfigs, 'schedulePeriod');
    },

    /**
     * 获取指定排班周期配置
     */
    getSchedulePeriodConfig(configId) {
        return (this.state.schedulePeriodConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建排班周期配置
     */
    createSchedulePeriodConfig(name, scheduleConfig, restDays = {}, cityScope = null) {
        const now = new Date();
        const configId = `schedule_period_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const schedulePeriodConfigs = this.getSchedulePeriodConfigs({ raw: true });
        const newConfig = {
            configId,
            name,
            scheduleConfig: scheduleConfig ? JSON.parse(JSON.stringify(scheduleConfig)) : null,
            restDaysSnapshot: JSON.parse(JSON.stringify(restDays || {})),
            cityScope: this.normalizeCityScope(cityScope || this.getActiveCityScope(), 'ALL'),
            schedulePeriod: scheduleConfig && scheduleConfig.startDate && scheduleConfig.endDate
                ? `${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}`
                : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.assertCanMutate('schedulePeriod', 'create', { cityScope: newConfig.cityScope });
        schedulePeriodConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新排班周期配置
     */
    updateSchedulePeriodConfig(configId, updates, autoSave = false) {
        const config = this.getSchedulePeriodConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();
        
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除排班周期配置
     */
    deleteSchedulePeriodConfig(configId) {
        const config = this.getSchedulePeriodConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        if (this.state.activeSchedulePeriodConfigId === configId) {
            this.state.activeSchedulePeriodConfigId = null;
            // 取消激活时，清空排班周期配置
            this.state.scheduleConfig = null;
            this.state.restDays = {};
        }
        this.state.schedulePeriodConfigs = (this.state.schedulePeriodConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
        
        // 实时更新排班周期控件
        if (typeof ScheduleLockManager !== 'undefined' && ScheduleLockManager.updateScheduleControlsState) {
            setTimeout(() => {
                ScheduleLockManager.updateScheduleControlsState();
            }, 50);
        }
    },

    /**
     * 设置激活的排班周期配置
     */
    async setActiveSchedulePeriodConfig(configId) {
        const config = this.getSchedulePeriodConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        this.state.activeSchedulePeriodConfigId = configId;
        this.syncActiveCityScope(config.cityScope, this.getActiveCityScope());

        // 加载配置的排班周期和休息日
        if (config.scheduleConfig) {
            this.state.scheduleConfig = JSON.parse(JSON.stringify(config.scheduleConfig));
        }
        if (config.restDaysSnapshot) {
            this.state.restDays = JSON.parse(JSON.stringify(config.restDaysSnapshot));
        }

        // 锁切换后，自动清理下游不属于当前锁的激活项
        const activeLock = this.getActiveLockContext();
        this.enforceActiveLockConsistency(activeLock);
        this.ensureLockProfilesShape();
        if (activeLock && activeLock.lockKey) {
            const existingMinimumProfile = this.getMinimumManpowerConfigForLock(activeLock.lockKey);
            if (existingMinimumProfile) {
                this.state.minimumManpowerConfig = this.deepClone(existingMinimumProfile);
            } else if (this.state.minimumManpowerConfig && typeof this.state.minimumManpowerConfig === 'object') {
                const normalized = this.normalizeMinimumManpowerCityConfig(this.deepClone(this.state.minimumManpowerConfig));
                normalized.schedulePeriodConfigId = activeLock.schedulePeriodConfigId;
                normalized.cityScope = activeLock.cityScope;
                this.state.minimumManpowerConfig = normalized;
                this.setMinimumManpowerConfigForLock(activeLock.lockKey, normalized, false);
            }
        }

        this.saveState();

        // 实时更新排班周期控件
        if (typeof ScheduleLockManager !== 'undefined' && ScheduleLockManager.updateScheduleControlsState) {
            setTimeout(() => {
                ScheduleLockManager.updateScheduleControlsState();
            }, 50);
        }
    },

    /**
     * 取消激活排班周期配置
     */
    async clearActiveSchedulePeriodConfig() {
        this.state.activeSchedulePeriodConfigId = null;
        this.state.scheduleConfig = null;
        this.state.restDays = {};
        await this.saveState();

        if (typeof ScheduleLockManager !== 'undefined' && ScheduleLockManager.updateScheduleControlsState) {
            setTimeout(() => {
                ScheduleLockManager.updateScheduleControlsState();
            }, 50);
        }
    },

    /**
     * 获取激活的排班周期配置
     * @returns {Object|null} 配置对象
     */
    getActiveSchedulePeriodConfig() {
        if (!this.state.activeSchedulePeriodConfigId) {
            return null;
        }
        return this.getSchedulePeriodConfig(this.state.activeSchedulePeriodConfigId);
    },

    // ==================== 全量休息配置管理 ====================

    /**
     * 创建全量休息配置
     * @param {string} name - 配置名称
     * @param {string} schedulePeriodConfigId - 关联的排班周期配置ID
     * @param {Object} constraints - 约束参数
     * @returns {string} 配置ID
     */
    createFullRestConfig(name, schedulePeriodConfigId, constraints = {}, cityScope = null) {
        const linkedPeriodId = schedulePeriodConfigId || this.state.activeSchedulePeriodConfigId || null;
        const linkedPeriod = this.getSchedulePeriodConfig(linkedPeriodId);
        const resolvedScope = this.normalizeCityScope(
            cityScope || (linkedPeriod && linkedPeriod.cityScope) || this.getActiveCityScope(),
            'ALL'
        );
        this.assertCanMutate('fullRest', 'create', { cityScope: resolvedScope });
        const configId = 'frc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const config = {
            configId,
            name,
            schedulePeriodConfigId: linkedPeriodId,
            cityScope: resolvedScope,
            constraints,
            fullRestSchedule: null,
            manpowerAnalysis: null,
            generatedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.state.fullRestConfigs.push(config);
        return configId;
    },

    /**
     * 更新全量休息配置
     * @param {string} configId - 配置ID
     * @param {Object} updates - 更新内容
     * @param {boolean} autoSave - 是否自动保存
     */
    updateFullRestConfig(configId, updates, autoSave = true) {
        const config = this.state.fullRestConfigs.find(c => c.configId === configId);
        if (!config) {
            throw new Error(`配置不存在: ${configId}`);
        }

        Object.assign(config, updates, { updatedAt: new Date().toISOString() });

        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 获取全量休息配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getFullRestConfig(configId) {
        return this.state.fullRestConfigs.find(c => c.configId === configId) || null;
    },

    /**
     * 获取所有全量休息配置
     * @returns {Array} 配置列表
     */
    getFullRestConfigs(options = {}) {
        const list = this.state.fullRestConfigs || [];
        if (options && options.raw === true) {
            return list;
        }
        return this.filterConfigsByCurrentUserScope(list, 'fullRest');
    },

    /**
     * 删除全量休息配置
     * @param {string} configId - 配置ID
     */
    deleteFullRestConfig(configId) {
        const index = this.state.fullRestConfigs.findIndex(c => c.configId === configId);
        if (index !== -1) {
            // 如果删除的是激活的配置，清空激活状态
            if (this.state.activeFullRestConfigId === configId) {
                this.state.activeFullRestConfigId = null;
            }
            this.state.fullRestConfigs.splice(index, 1);
            this.saveState();
        }
    },

    /**
     * 设置激活的全量休息配置
     * @param {string} configId - 配置ID
     */
    async setActiveFullRestConfig(configId) {
        const config = this.getFullRestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        if (activeLock.valid && !this.isConfigInActiveLock(config, { configType: 'fullRest' })) {
            throw new Error('全量休息配置与当前激活的城市+周期不一致，无法激活');
        }
        this.state.activeFullRestConfigId = configId;
        this.syncActiveCityScope(config.cityScope, this.getActiveCityScope());
        await this.saveState();
    },

    /**
     * 取消激活全量休息配置
     */
    async clearActiveFullRestConfig() {
        this.state.activeFullRestConfigId = null;
        await this.saveState();
    },

    /**
     * ==================== 月度班次配置管理 ====================
     */

    /**
     * 获取月度班次配置列表
     * @returns {Array} 配置列表
     */
    getMonthlyShiftConfigs(options = {}) {
        const list = this.state.monthlyShiftConfigs || [];
        if (options && options.raw === true) {
            return list;
        }
        return this.filterConfigsByCurrentUserScope(list, 'monthlyShift');
    },

    replaceMonthlyShiftConfigs(configs = [], autoSave = false, options = {}) {
        const actorEmpNo = options.actorEmpNo || 'SYSTEM_MIGRATION';
        const source = Array.isArray(configs) ? configs : [];
        this.state.monthlyShiftConfigs = source.map((item) => {
            const row = this.deepClone(item || {});
            this.normalizeConfigMeta(row, 'monthlyShift', { actorEmpNo, keepUpdatedAt: true });
            return row;
        });
        if (autoSave) {
            this.saveState();
        }
        return this.state.monthlyShiftConfigs;
    },

    /**
     * 获取指定月度班次配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getMonthlyShiftConfig(configId) {
        return (this.state.monthlyShiftConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建月度班次配置
     * @param {string} name - 配置名称
     * @param {Object} monthlyShifts - 月度班次分配 {staffId: shiftType, ...}
     * @param {string} schedulePeriod - 排班周期
     * @returns {string} 配置ID
     */
    createMonthlyShiftConfig(name, monthlyShifts, schedulePeriod, cityScope = null, schedulePeriodConfigId = null) {
        const now = new Date();
        const configId = `monthly_shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const linkedPeriodId = schedulePeriodConfigId || this.state.activeSchedulePeriodConfigId || null;
        const linkedPeriod = linkedPeriodId ? this.getSchedulePeriodConfig(linkedPeriodId) : null;
        const newConfig = {
            configId,
            name,
            monthlyShifts: JSON.parse(JSON.stringify(monthlyShifts || {})),
            schedulePeriod,
            cityScope: this.normalizeCityScope(cityScope || (linkedPeriod && linkedPeriod.cityScope) || this.getActiveCityScope(), 'ALL'),
            schedulePeriodConfigId: linkedPeriodId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.assertCanMutate('monthlyShift', 'create', { cityScope: newConfig.cityScope });
        this.state.monthlyShiftConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新月度班次配置
     * @param {string} configId - 配置ID
     * @param {Object} updates - 要更新的字段
     * @param {boolean} autoSave - 是否自动保存（默认不保存）
     */
    updateMonthlyShiftConfig(configId, updates, autoSave = false) {
        const config = this.getMonthlyShiftConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除月度班次配置
     * @param {string} configId - 配置ID
     */
    deleteMonthlyShiftConfig(configId) {
        const config = this.getMonthlyShiftConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        // 如果删除的是激活的配置，清空激活状态
        if (this.state.activeMonthlyShiftConfigId === configId) {
            this.state.activeMonthlyShiftConfigId = null;
        }
        this.state.monthlyShiftConfigs = (this.state.monthlyShiftConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
    },

    /**
     * 设置激活的月度班次配置
     * @param {string} configId - 配置ID
     */
    async setActiveMonthlyShiftConfig(configId) {
        const config = this.getMonthlyShiftConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        if (activeLock.valid && !this.isConfigInActiveLock(config, { configType: 'monthlyShift' })) {
            throw new Error('月度班次配置与当前激活的城市+周期不一致，无法激活');
        }
        this.state.activeMonthlyShiftConfigId = configId;
        this.syncActiveCityScope(config.cityScope, this.getActiveCityScope());
        await this.saveState();
    },

    /**
     * 获取激活的月度班次配置
     * @returns {Object|null} 配置对象
     */
    getActiveMonthlyShiftConfig() {
        if (!this.state.activeMonthlyShiftConfigId) {
            return null;
        }
        return this.getMonthlyShiftConfig(this.state.activeMonthlyShiftConfigId);
    },

    /**
     * 清除激活的月度班次配置
     */
    async clearActiveMonthlyShiftConfig() {
        this.state.activeMonthlyShiftConfigId = null;
        await this.saveState();
    },

    /**
     * 设置激活的每日人力配置
     * @param {string} configId - 配置ID
     * @param {string} cityScope - 城市范围（可选）
     * @param {string} schedulePeriodConfigId - 排班周期配置ID（可选）
     */
    async setActiveDailyManpowerConfig(configId, cityScope = null, schedulePeriodConfigId = null) {
        if (!configId) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        const resolvedScope = this.normalizeCityScope(cityScope || (activeLock && activeLock.cityScope) || this.getActiveCityScope(), 'ALL');
        const resolvedPeriodId = schedulePeriodConfigId || (activeLock && activeLock.schedulePeriodConfigId) || this.state.activeSchedulePeriodConfigId || null;
        if (activeLock && activeLock.valid) {
            const incomingLockKey = this.buildLockKey(resolvedPeriodId, resolvedScope);
            if (incomingLockKey && incomingLockKey !== activeLock.lockKey) {
                throw new Error('每日人力配置与当前激活的城市+周期不一致，无法激活');
            }
        }
        this.state.activeDailyManpowerConfigId = configId;
        this.syncActiveCityScope(resolvedScope, this.getActiveCityScope());
        await this.saveState();
    },

    /**
     * 取消激活每日人力配置
     */
    async clearActiveDailyManpowerConfig() {
        this.state.activeDailyManpowerConfigId = null;
        await this.saveState();
    },

    /**
     * 设置法定休息日
     */
    setRestDay(dateStr, isRestDay) {
        if (!this.state.restDays) {
            this.state.restDays = {};
        }
        if (isRestDay) {
            this.state.restDays[dateStr] = true;
        } else {
            delete this.state.restDays[dateStr];
        }
        this.saveState();
    },

    /**
     * 判断休息日
     */
    isRestDay(dateStr) {
        return this.state.restDays && this.state.restDays[dateStr] === true;
    },

    /**
     * 获取所有休息日
     */
    getAllRestDays() {
        return this.state.restDays || {};
    },

    /**
     * 保存状态到 IndexedDB
     */
    async saveState(saveToFile = false) {
        try {
            this.ensureUsersAndSessionShape();
            this.persistCurrentUserLockContext();
            // 保存到IndexedDB
            if (typeof DB !== 'undefined' && DB.db) {
                // 使用 Promise.all 并行保存，提高性能
                const savePromises = [];
                
                // 保存应用状态（确保包含激活状态）
                console.log('saveState: 保存前的激活状态 - activeConfigId:', this.state.activeConfigId, 'activeRequestConfigId:', this.state.activeRequestConfigId);
                savePromises.push(DB.saveAppState(this.state));
                
                // 批量保存人员数据历史（并行执行）
                const staffHistoryPromises = Object.entries(this.state.staffDataHistory).map(
                    ([staffId, history]) => DB.saveStaffHistory(staffId, history)
                );
                savePromises.push(...staffHistoryPromises);
                
                // 批量保存配置记录（并行执行）
                const staffConfigPromises = this.state.staffConfigs.map(
                    config => DB.saveConfig(config)
                );
                savePromises.push(...staffConfigPromises);

                // 批量保存个性化需求配置记录（并行执行）
                const requestConfigPromises = this.state.requestConfigs.map(
                    config => DB.saveRequestConfig(config)
                );
                savePromises.push(...requestConfigPromises);
                
                // 批量保存排班周期配置记录（并行执行）
                const schedulePeriodConfigPromises = (this.state.schedulePeriodConfigs || []).map(
                    config => DB.saveSchedulePeriodConfig(config)
                );
                savePromises.push(...schedulePeriodConfigPromises);
                
                // 等待所有保存操作完成
                await Promise.all(savePromises);
                
                console.log('状态已保存到 IndexedDB');
                
                // 只有在明确要求时才导出到文件
                if (saveToFile) {
                    try {
                        await DB.exportToFile();
                        console.log('数据已导出到本地文件');
                    } catch (exportError) {
                        console.warn('导出到文件失败，但数据已保存到 IndexedDB:', exportError);
                        throw exportError;
                    }
                }
            }
        } catch (error) {
            console.error('保存状态失败:', error);
            throw error;
        }
    },

    /**
     * 从 IndexedDB 加载状态
     */
    async loadState() {
        try {
            // 从IndexedDB加载
            if (typeof DB !== 'undefined' && DB.db) {
                const loadedState = await DB.loadAppState();
                const staffHistory = await DB.loadAllStaffHistory();
                const configs = await DB.loadAllConfigs();
                const requestConfigs = await DB.loadAllRequestConfigs();
                const schedulePeriodConfigs = await DB.loadAllSchedulePeriodConfigs();
                
                // 检查浏览器存储是否有数据
                const hasBrowserData = loadedState || (staffHistory && Object.keys(staffHistory).length > 0) || (configs && configs.length > 0) || (requestConfigs && requestConfigs.length > 0) || (schedulePeriodConfigs && schedulePeriodConfigs.length > 0);
                
                if (hasBrowserData) {
                    // 浏览器有数据，使用浏览器数据
                    if (loadedState) {
                        // 加载人员数据历史
                        if (staffHistory && Object.keys(staffHistory).length > 0) {
                            loadedState.staffDataHistory = staffHistory;
                        }
                        
                        // 加载配置记录
                        if (configs && configs.length > 0) {
                            loadedState.staffConfigs = configs;
                        }
                        
                        // 加载个性化需求配置记录
                        if (requestConfigs && requestConfigs.length > 0) {
                            loadedState.requestConfigs = requestConfigs;
                        }
                        
                        // 加载排班周期配置记录
                        if (schedulePeriodConfigs && schedulePeriodConfigs.length > 0) {
                            loadedState.schedulePeriodConfigs = schedulePeriodConfigs;
                        }
                        
                        // 先保存激活状态，避免被覆盖
                        const savedActiveConfigId = loadedState.activeConfigId;
                        const savedActiveRequestConfigId = loadedState.activeRequestConfigId;
                        const savedActiveSchedulePeriodConfigId = loadedState.activeSchedulePeriodConfigId;
                        
                        console.log('loadState: 从IndexedDB加载的状态:', {
                            activeConfigId: savedActiveConfigId,
                            activeRequestConfigId: savedActiveRequestConfigId,
                            hasActiveConfigId: savedActiveConfigId !== undefined && savedActiveConfigId !== null,
                            hasActiveRequestConfigId: savedActiveRequestConfigId !== undefined && savedActiveRequestConfigId !== null,
                            loadedStateKeys: Object.keys(loadedState),
                            loadedStateActiveConfigId: loadedState.activeConfigId,
                            loadedStateActiveRequestConfigId: loadedState.activeRequestConfigId
                        });
                        
                        // 合并加载的状态，保留默认值
                        // 注意：Object.assign 会覆盖 this.state 中的值，所以我们需要在合并后恢复激活状态
                        this.state = Object.assign({}, this.state, loadedState);
                        this.ensureUsersAndSessionShape();
                        
                        // 确保激活状态正确恢复（优先使用加载的值，如果加载的值是 null 或 undefined，也要保留）
                        // 注意：null 和 undefined 的区别 - null 表示明确设置为空，undefined 表示未定义
                        if (savedActiveConfigId !== undefined) {
                            // 如果加载的状态中有 activeConfigId（包括 null），使用加载的值
                            this.state.activeConfigId = savedActiveConfigId;
                            console.log('loadState: 恢复 activeConfigId =', savedActiveConfigId);
                        } else {
                            // 如果加载的状态中没有 activeConfigId，保持当前值（可能是默认的 null）
                            console.log('loadState: loadedState 中没有 activeConfigId，保持当前值:', this.state.activeConfigId);
                        }
                        
                        if (savedActiveRequestConfigId !== undefined) {
                            // 如果加载的状态中有 activeRequestConfigId（包括 null），使用加载的值
                            this.state.activeRequestConfigId = savedActiveRequestConfigId;
                            console.log('loadState: 恢复 activeRequestConfigId =', savedActiveRequestConfigId);
                        } else {
                            // 如果加载的状态中没有 activeRequestConfigId，保持当前值（可能是默认的 null）
                            console.log('loadState: loadedState 中没有 activeRequestConfigId，保持当前值:', this.state.activeRequestConfigId);
                        }
                        
                        // 确保激活状态正确恢复
                        console.log('loadState: 恢复激活状态后 - activeConfigId:', this.state.activeConfigId, 'activeRequestConfigId:', this.state.activeRequestConfigId);
                        
                        // 确保新增字段有默认值（兼容旧数据）
                        if (!this.state.currentView) {
                            this.state.currentView = 'schedule';
                        }
                        if (this.state.currentSubView === undefined) {
                            this.state.currentSubView = null;
                        }
                        if (this.state.currentConfigId === undefined) {
                            this.state.currentConfigId = null;
                        }
                        
                        // 确保激活状态字段存在（兼容旧数据）
                        // 注意：只有在加载的状态中没有定义时才设置为null，如果加载的状态中是null，也要保留
                        if (savedActiveConfigId === undefined && this.state.activeConfigId === undefined) {
                            this.state.activeConfigId = null;
                        }
                        if (savedActiveRequestConfigId === undefined && this.state.activeRequestConfigId === undefined) {
                            this.state.activeRequestConfigId = null;
                        }
                        
                        // 最终确认激活状态
                        console.log('loadState: 最终激活状态 - activeConfigId:', this.state.activeConfigId, 'activeRequestConfigId:', this.state.activeRequestConfigId);
                    } else {
                        // 只有部分数据，也要合并
                        if (staffHistory && Object.keys(staffHistory).length > 0) {
                            this.state.staffDataHistory = staffHistory;
                        }
                        if (configs && configs.length > 0) {
                            this.state.staffConfigs = configs;
                        }
                        if (requestConfigs && requestConfigs.length > 0) {
                            this.state.requestConfigs = requestConfigs;
                        }
                        if (schedulePeriodConfigs && schedulePeriodConfigs.length > 0) {
                            this.state.schedulePeriodConfigs = schedulePeriodConfigs;
                        }
                    }
                    const migrated = this.applyCityDimensionMigration();
                    const chainAdjusted = this.enforceActiveLockConsistency();
                    this.persistCurrentUserLockContext();
                    if (migrated || chainAdjusted) {
                        console.log('已执行城市维度迁移并保存');
                        await this.saveState();
                    }
                    console.log('状态已从 IndexedDB 恢复');
                    return true;
                } else {
                    // 浏览器存储为空，尝试从本地文件加载
                    try {
                        const response = await fetch('database/shiftscheduler.json');
                        if (response && response.ok) {
                            const fileData = await response.json();
                            
                            // 导入应用状态
                            if (fileData.appState) {
                                await DB.saveAppState(fileData.appState);
                                this.state = Object.assign({}, this.state, fileData.appState);
                                
                                // 确保新增字段有默认值（兼容旧数据）
                                if (!this.state.currentView) {
                                    this.state.currentView = 'schedule';
                                }
                                if (this.state.currentSubView === undefined) {
                                    this.state.currentSubView = null;
                                }
                                if (this.state.currentConfigId === undefined) {
                                    this.state.currentConfigId = null;
                                }
                            }
                            
                            // 导入人员数据历史
                            if (fileData.staffDataHistory) {
                                for (const staffId in fileData.staffDataHistory) {
                                    if (fileData.staffDataHistory.hasOwnProperty(staffId)) {
                                        await DB.saveStaffHistory(staffId, fileData.staffDataHistory[staffId]);
                                    }
                                }
                                this.state.staffDataHistory = fileData.staffDataHistory;
                            }
                            
                            // 导入配置记录
                            if (fileData.staffConfigs) {
                                for (let i = 0; i < fileData.staffConfigs.length; i++) {
                                    await DB.saveConfig(fileData.staffConfigs[i]);
                                }
                                this.state.staffConfigs = fileData.staffConfigs;
                            }

                            // 导入个性化需求配置记录
                            if (fileData.requestConfigs) {
                                for (let i = 0; i < fileData.requestConfigs.length; i++) {
                                    await DB.saveRequestConfig(fileData.requestConfigs[i]);
                                }
                                this.state.requestConfigs = fileData.requestConfigs;
                            }
                            
                            // 导入积分公式
                            if (fileData.scoreFormula) {
                                await DB.saveScoreFormula(fileData.scoreFormula);
                            }
                            
                            // 导入休息日规则配置
                            if (fileData.restDayRules) {
                                await DB.saveRestDayRules(fileData.restDayRules);
                            }
                            
                            const migrated = this.applyCityDimensionMigration();
                            const chainAdjusted = this.enforceActiveLockConsistency();
                            this.persistCurrentUserLockContext();
                            if (migrated || chainAdjusted) {
                                await this.saveState();
                            }
                            console.log('状态已从本地文件 database/shiftscheduler.json 加载');
                            return true;
                        }
                    } catch (fileError) {
                        // 文件不存在或读取失败，忽略错误
                        console.log('本地文件不存在或读取失败，使用默认状态');
                    }
                }
            }
            
            this.ensureUsersAndSessionShape();
            this.persistCurrentUserLockContext();
            return false;
        } catch (error) {
            console.error('加载状态失败:', error);
            this.ensureUsersAndSessionShape();
            return false;
        }
    },

    getDefaultCityCodes() {
        if (typeof CityUtils !== 'undefined' && CityUtils.getAllCityCodes) {
            return CityUtils.getAllCityCodes();
        }
        return ['SH', 'CD'];
    },

    normalizeStaffCityFields(staffLike) {
        if (!staffLike || typeof staffLike !== 'object') return staffLike;
        if (typeof CityUtils !== 'undefined' && CityUtils.normalizeStaffCityFields) {
            return CityUtils.normalizeStaffCityFields(staffLike, 'SH');
        }
        const out = { ...staffLike };
        const rawCity = String(out.city || '').trim().toUpperCase();
        const rawLocation = String(out.location || '').trim();
        if (rawCity === 'CD' || rawLocation === '成都') {
            out.city = 'CD';
            out.location = '成都';
            return out;
        }
        out.city = 'SH';
        out.location = '上海';
        return out;
    },

    normalizeMinimumManpowerCityConfig(configLike) {
        if (!configLike || typeof configLike !== 'object') return configLike;
        const config = { ...configLike };
        if (!config.cityShiftSplit || typeof config.cityShiftSplit !== 'object') {
            config.cityShiftSplit = {
                SH: { A1: 2, A: 2, A2: 1, B1: 2, B2: 3, NIGHT: 2 },
                CD: { A1: 3, A: 5, A2: 4, B1: 4, B2: 6, NIGHT: 2 }
            };
        }
        if (!config.scenarioSkillDemand || typeof config.scenarioSkillDemand !== 'object') {
            config.scenarioSkillDemand = {
                'A1银': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B1银': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B2银': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'A追': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B2追': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'A1微': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
                'A微': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'A2微': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B1微': { springPre3: 1, nationalPre3: 1, springLate: 2, nationalLate: 2, dailyBaseline: 2, stretch: 2 },
                'B2微': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 2 },
                'A1网': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 2 },
                'A网': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 2, stretch: 2 },
                'A2网': { springPre3: 1, nationalPre3: 2, springLate: 2, nationalLate: 2, dailyBaseline: 2, stretch: 3 },
                'B1网': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 2, stretch: 2 },
                'B2网': { springPre3: 2, nationalPre3: 2, springLate: 2, nationalLate: 2, dailyBaseline: 2, stretch: 2 },
                'A1天': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
                'A天': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'A2天': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B1天': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
                'B2天': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'A收/综': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B2收/综': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'A1星': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'A星': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 1, stretch: 2 },
                'A2星': { springPre3: 0, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B1星': { springPre3: 0, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B2星': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
                'A1毛': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                'B2毛': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
                '夜': { springPre3: 4, nationalPre3: 4, springLate: 4, nationalLate: 4, dailyBaseline: 4, stretch: 4 }
            };
        }
        return config;
    },

    applyCityDimensionMigration() {
        let changed = false;
        const beforeUsersSerialized = JSON.stringify({
            users: Array.isArray(this.state.users) ? this.state.users : [],
            currentSession: this.state.currentSession || null,
            userLockContexts: this.state.userLockContexts || {},
            auditLogsCount: Array.isArray(this.state.auditLogs) ? this.state.auditLogs.length : 0
        });
        this.ensureUsersAndSessionShape();
        const afterUsersSerialized = JSON.stringify({
            users: Array.isArray(this.state.users) ? this.state.users : [],
            currentSession: this.state.currentSession || null,
            userLockContexts: this.state.userLockContexts || {},
            auditLogsCount: Array.isArray(this.state.auditLogs) ? this.state.auditLogs.length : 0
        });
        if (beforeUsersSerialized !== afterUsersSerialized) {
            changed = true;
        }

        const normalizeList = (list) => {
            if (!Array.isArray(list)) return false;
            let touched = false;
            list.forEach((staff, idx) => {
                if (!staff || typeof staff !== 'object') return;
                const normalized = this.normalizeStaffCityFields(staff);
                if (!normalized) return;
                const cityChanged = normalized.city !== staff.city;
                const locationChanged = normalized.location !== staff.location;
                if (!cityChanged && !locationChanged) return;
                list[idx] = normalized;
                touched = true;
            });
            return touched;
        };

        const inferScopeByYearMonth = (year, month, fallback = 'ALL') => {
            if (!year || !month) return this.normalizeCityScope(fallback, 'ALL');
            const yearMonth = `${year}${String(month).padStart(2, '0')}`;
            const periodConfigs = this.state.schedulePeriodConfigs || [];
            const scopes = periodConfigs
                .filter((cfg) => {
                    if (!cfg || !cfg.scheduleConfig) return false;
                    const y = cfg.scheduleConfig.year;
                    const m = cfg.scheduleConfig.month;
                    return `${y}${String(m).padStart(2, '0')}` === yearMonth;
                })
                .map((cfg) => this.normalizeCityScope(cfg.cityScope, 'ALL'));
            const uniqueScopes = Array.from(new Set(scopes));
            if (uniqueScopes.length === 1) return uniqueScopes[0];
            return this.normalizeCityScope(fallback, 'ALL');
        };

        const inferScopeByStaffSnapshot = (snapshot, fallback = 'ALL') => this.inferStaffSnapshotCityScope(snapshot, fallback);

        const bindSchedulePeriodForList = (list, configType) => {
            if (!Array.isArray(list)) return;
            list.forEach((config) => {
                if (!config || typeof config !== 'object') return;
                const inferredPeriodId = this.inferSchedulePeriodConfigId(config, configType);
                const currentPeriodId = config.schedulePeriodConfigId || null;
                if (inferredPeriodId !== currentPeriodId) {
                    config.schedulePeriodConfigId = inferredPeriodId;
                    changed = true;
                }
                if (!inferredPeriodId) {
                    if (!config.unboundArchive) {
                        config.unboundArchive = true;
                        changed = true;
                    }
                } else if (config.unboundArchive) {
                    delete config.unboundArchive;
                    changed = true;
                }
            });
        };

        Object.keys(this.state.staffDataHistory || {}).forEach((staffId) => {
            const history = this.state.staffDataHistory[staffId];
            if (!Array.isArray(history)) return;
            history.forEach((record) => {
                if (!record || !record.data || typeof record.data !== 'object') return;
                const normalized = this.normalizeStaffCityFields(record.data);
                if (!normalized) return;
                const cityChanged = normalized.city !== record.data.city;
                const locationChanged = normalized.location !== record.data.location;
                if (!cityChanged && !locationChanged) return;
                record.data = normalized;
                changed = true;
            });
        });

        (this.state.staffConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            if (Array.isArray(config.staffDataSnapshot) && normalizeList(config.staffDataSnapshot)) {
                changed = true;
            }
            const inferredScope = inferScopeByStaffSnapshot(config.staffDataSnapshot || [], config.cityScope || 'ALL');
            if (config.cityScope !== inferredScope) {
                config.cityScope = inferredScope;
                changed = true;
            }
        });
        bindSchedulePeriodForList(this.state.staffConfigs || [], 'staff');

        (this.state.monthlyScheduleConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            if (!config.cityDimensionVersion) {
                config.cityDimensionVersion = 'v1';
                changed = true;
            }
            const inferredScope = config.scheduleConfig
                ? inferScopeByYearMonth(config.scheduleConfig.year, config.scheduleConfig.month, config.cityScope || 'ALL')
                : this.normalizeCityScope(config.cityScope, 'ALL');
            if (config.cityScope !== inferredScope) {
                config.cityScope = inferredScope;
                changed = true;
            }
            if (!config.staffScheduleData || typeof config.staffScheduleData !== 'object') return;
            Object.keys(config.staffScheduleData).forEach((staffId) => {
                const row = config.staffScheduleData[staffId];
                if (!row || typeof row !== 'object') return;
                const normalized = this.normalizeStaffCityFields(row);
                const cityChanged = normalized.city !== row.city;
                const locationChanged = normalized.location !== row.location;
                if (!cityChanged && !locationChanged) return;
                config.staffScheduleData[staffId] = {
                    ...row,
                    city: normalized.city,
                    location: normalized.location
                };
                changed = true;
            });
        });
        bindSchedulePeriodForList(this.state.monthlyScheduleConfigs || [], 'monthlySchedule');

        (this.state.schedulePeriodConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            const normalizedScope = this.normalizeCityScope(config.cityScope, 'ALL');
            if (config.cityScope !== normalizedScope) {
                config.cityScope = normalizedScope;
                changed = true;
            }
            const beforeLockKey = config.lockKey || null;
            const beforeCreatedBy = config.createdByEmpNo || null;
            const beforeUpdatedBy = config.updatedByEmpNo || null;
            this.normalizeConfigMeta(config, 'schedulePeriod', { actorEmpNo: 'SYSTEM_MIGRATION', keepUpdatedAt: true });
            if (beforeLockKey !== (config.lockKey || null)
                || beforeCreatedBy !== (config.createdByEmpNo || null)
                || beforeUpdatedBy !== (config.updatedByEmpNo || null)) {
                changed = true;
            }
        });

        (this.state.requestConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            const inferredScope = config.scheduleConfig
                ? inferScopeByYearMonth(config.scheduleConfig.year, config.scheduleConfig.month, config.cityScope || 'ALL')
                : this.normalizeCityScope(config.cityScope, 'ALL');
            if (config.cityScope !== inferredScope) {
                config.cityScope = inferredScope;
                changed = true;
            }
        });
        bindSchedulePeriodForList(this.state.requestConfigs || [], 'request');

        (this.state.fullRestConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            const linkedPeriod = config.schedulePeriodConfigId
                ? this.getSchedulePeriodConfig(config.schedulePeriodConfigId)
                : null;
            const inferredScope = linkedPeriod
                ? this.normalizeCityScope(linkedPeriod.cityScope, 'ALL')
                : this.normalizeCityScope(config.cityScope, 'ALL');
            if (config.cityScope !== inferredScope) {
                config.cityScope = inferredScope;
                changed = true;
            }
        });
        bindSchedulePeriodForList(this.state.fullRestConfigs || [], 'fullRest');

        (this.state.nightShiftConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            const inferredScope = config.scheduleConfig
                ? inferScopeByYearMonth(config.scheduleConfig.year, config.scheduleConfig.month, config.cityScope || 'ALL')
                : this.normalizeCityScope(config.cityScope, 'ALL');
            if (config.cityScope !== inferredScope) {
                config.cityScope = inferredScope;
                changed = true;
            }
        });
        bindSchedulePeriodForList(this.state.nightShiftConfigs || [], 'nightShift');

        (this.state.scheduleResultConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            const inferredScope = config.scheduleConfig
                ? inferScopeByYearMonth(config.scheduleConfig.year, config.scheduleConfig.month, config.cityScope || 'ALL')
                : this.normalizeCityScope(config.cityScope, 'ALL');
            if (config.cityScope !== inferredScope) {
                config.cityScope = inferredScope;
                changed = true;
            }
        });
        bindSchedulePeriodForList(this.state.scheduleResultConfigs || [], 'scheduleResult');

        (this.state.monthlyShiftConfigs || []).forEach((config) => {
            if (!config || typeof config !== 'object') return;
            const normalizedScope = this.normalizeCityScope(config.cityScope, 'ALL');
            if (config.cityScope !== normalizedScope) {
                config.cityScope = normalizedScope;
                changed = true;
            }
        });
        bindSchedulePeriodForList(this.state.monthlyShiftConfigs || [], 'monthlyShift');

        const normalizeMetaForList = (list, configType) => {
            if (!Array.isArray(list)) return;
            list.forEach((config) => {
                if (!config || typeof config !== 'object') return;
                const before = {
                    lockKey: config.lockKey || null,
                    createdByEmpNo: config.createdByEmpNo || null,
                    updatedByEmpNo: config.updatedByEmpNo || null,
                    cityScope: config.cityScope || null,
                    schedulePeriodConfigId: config.schedulePeriodConfigId || null
                };
                this.normalizeConfigMeta(config, configType, { actorEmpNo: 'SYSTEM_MIGRATION', keepUpdatedAt: true });
                const after = {
                    lockKey: config.lockKey || null,
                    createdByEmpNo: config.createdByEmpNo || null,
                    updatedByEmpNo: config.updatedByEmpNo || null,
                    cityScope: config.cityScope || null,
                    schedulePeriodConfigId: config.schedulePeriodConfigId || null
                };
                if (JSON.stringify(before) !== JSON.stringify(after)) {
                    changed = true;
                }
            });
        };
        normalizeMetaForList(this.state.staffConfigs || [], 'staff');
        normalizeMetaForList(this.state.requestConfigs || [], 'request');
        normalizeMetaForList(this.state.fullRestConfigs || [], 'fullRest');
        normalizeMetaForList(this.state.monthlyShiftConfigs || [], 'monthlyShift');
        normalizeMetaForList(this.state.monthlyScheduleConfigs || [], 'monthlySchedule');
        normalizeMetaForList(this.state.nightShiftConfigs || [], 'nightShift');
        normalizeMetaForList(this.state.scheduleResultConfigs || [], 'scheduleResult');

        if (this.state.minimumManpowerConfig && typeof this.state.minimumManpowerConfig === 'object') {
            const hasCityShiftSplit = !!this.state.minimumManpowerConfig.cityShiftSplit;
            const hasScenarioDemand = !!this.state.minimumManpowerConfig.scenarioSkillDemand;
            if (!hasCityShiftSplit || !hasScenarioDemand) {
                const normalizedMinimumConfig = this.normalizeMinimumManpowerCityConfig(this.state.minimumManpowerConfig);
                this.state.minimumManpowerConfig = normalizedMinimumConfig;
                changed = true;
            }
        }
        this.ensureLockProfilesShape();
        Object.keys(this.state.ruleConfigProfiles || {}).forEach((lockKey) => {
            const profile = this.state.ruleConfigProfiles[lockKey];
            if (!profile || typeof profile !== 'object') {
                delete this.state.ruleConfigProfiles[lockKey];
                changed = true;
                return;
            }
            const parsed = this.parseLockKey(lockKey);
            if (!parsed.schedulePeriodConfigId) {
                delete this.state.ruleConfigProfiles[lockKey];
                changed = true;
                return;
            }
            if (profile.schedulePeriodConfigId !== parsed.schedulePeriodConfigId || profile.cityScope !== parsed.cityScope) {
                profile.schedulePeriodConfigId = parsed.schedulePeriodConfigId;
                profile.cityScope = parsed.cityScope;
                changed = true;
            }
        });
        Object.keys(this.state.minimumManpowerProfiles || {}).forEach((lockKey) => {
            const profile = this.state.minimumManpowerProfiles[lockKey];
            if (!profile || typeof profile !== 'object') {
                delete this.state.minimumManpowerProfiles[lockKey];
                changed = true;
                return;
            }
            const parsed = this.parseLockKey(lockKey);
            if (!parsed.schedulePeriodConfigId) {
                delete this.state.minimumManpowerProfiles[lockKey];
                changed = true;
                return;
            }
            if (profile.schedulePeriodConfigId !== parsed.schedulePeriodConfigId || profile.cityScope !== parsed.cityScope) {
                profile.schedulePeriodConfigId = parsed.schedulePeriodConfigId;
                profile.cityScope = parsed.cityScope;
                changed = true;
            }
        });
        const activeLock = this.getActiveLockContext();
        if (this.state.minimumManpowerConfig && typeof this.state.minimumManpowerConfig === 'object') {
            if (activeLock && activeLock.valid && activeLock.lockKey) {
                const minCfg = this.deepClone(this.state.minimumManpowerConfig);
                minCfg.schedulePeriodConfigId = activeLock.schedulePeriodConfigId;
                minCfg.cityScope = activeLock.cityScope;
                if (!this.state.minimumManpowerProfiles[activeLock.lockKey]) {
                    this.state.minimumManpowerProfiles[activeLock.lockKey] = minCfg;
                    changed = true;
                }
                this.state.minimumManpowerConfig = this.deepClone(this.state.minimumManpowerProfiles[activeLock.lockKey]);
            }
        }

        if (!this.state.cityDimension || typeof this.state.cityDimension !== 'object') {
            this.state.cityDimension = {
                enabled: true,
                defaultCity: 'SH',
                supportedCities: this.getDefaultCityCodes()
            };
            changed = true;
        }
        if (!this.state.activeCityScope) {
            this.state.activeCityScope = 'ALL';
            changed = true;
        } else {
            const normalizedScope = this.normalizeCityScope(this.state.activeCityScope, 'ALL');
            if (normalizedScope !== this.state.activeCityScope) {
                this.state.activeCityScope = normalizedScope;
                changed = true;
            }
        }
        const activePeriod = this.getActiveSchedulePeriodConfig();
        if (activePeriod) {
            const activeScope = this.normalizeCityScope(activePeriod.cityScope, 'ALL');
            if (this.state.activeCityScope !== activeScope) {
                this.state.activeCityScope = activeScope;
                changed = true;
            }
        }
        const currentSession = this.getCurrentSession();
        if (currentSession) {
            const nextLockKey = this.buildLockKey(this.state.activeSchedulePeriodConfigId || null, this.state.activeCityScope);
            if (currentSession.activePeriodId !== this.state.activeSchedulePeriodConfigId
                || currentSession.activeCityScope !== this.state.activeCityScope
                || currentSession.activeLockKey !== nextLockKey) {
                currentSession.activePeriodId = this.state.activeSchedulePeriodConfigId || null;
                currentSession.activeCityScope = this.state.activeCityScope;
                currentSession.activeLockKey = nextLockKey;
                changed = true;
            }
        }
        this.persistCurrentUserLockContext();

        return changed;
    },

    /**
     * 清空状态
     */
    async clearState() {
        this.state = {
            staffDataHistory: {},
            staffConfigs: [],
            activeConfigId: null,
            scheduleConfig: {
                startDate: null,
                endDate: null,
                year: null,
                month: null
            },
            constraints: [],
            personalRequests: {},
            requestConfigs: [],
            activeRequestConfigId: null,
            schedulePeriodConfigs: [],
            activeSchedulePeriodConfigId: null,
            fullRestConfigs: [],
            activeFullRestConfigId: null,
            monthlyShiftConfigs: [],
            activeMonthlyShiftConfigId: null,
            monthlyScheduleConfigs: [],
            activeMonthlyScheduleConfigId: null,
            nightShiftConfigs: [],
            activeNightShiftConfigId: null,
            scheduleResultConfigs: [],
            activeScheduleResultConfigId: null,
            activeDailyManpowerConfigId: null,
            minimumManpowerConfig: null,
            minimumManpowerProfiles: {},
            ruleConfigProfiles: {},
            restDays: {},
            finalSchedule: null,
            activeCityScope: 'ALL',
            cityDimension: {
                enabled: true,
                defaultCity: 'SH',
                supportedCities: ['SH', 'CD']
            },
            users: this.getDefaultUsers(),
            currentSession: null,
            userLockContexts: {},
            auditLogs: []
        };
        this.ensureUsersAndSessionShape();
        // 清空 localStorage
        localStorage.removeItem('shiftSchedulerState');
        // 清空 IndexedDB
        if (typeof DB !== 'undefined' && DB.db) {
            try {
                await DB.clearAll();
            } catch (error) {
                console.error('清空IndexedDB失败:', error);
            }
        }
        console.log('状态已清空');
    },

    /**
     * 重置为初始状态（保留某些数据）
     * @param {Object} options - 重置选项
     */
    resetState(options = {}) {
        const preserved = {};
        if (options.preserveStaff) {
            preserved.staffDataHistory = this.state.staffDataHistory;
        }
        if (options.preserveConfig) {
            preserved.scheduleConfig = this.state.scheduleConfig;
        }
        if (options.preserveConstraints) {
            preserved.constraints = this.state.constraints;
        }
        if (options.preserveRequests) {
            preserved.personalRequests = this.state.personalRequests;
            preserved.requestConfigs = this.state.requestConfigs;
            preserved.activeRequestConfigId = this.state.activeRequestConfigId;
            preserved.restDays = this.state.restDays;
        }
        if (options.preserveAuth !== false) {
            preserved.users = this.state.users;
            preserved.currentSession = this.state.currentSession;
            preserved.userLockContexts = this.state.userLockContexts;
            preserved.auditLogs = this.state.auditLogs;
        }

        this.state = {
            staffDataHistory: preserved.staffDataHistory || {},
            staffConfigs: preserved.staffConfigs || [],
            activeConfigId: preserved.activeConfigId || null,
            scheduleConfig: preserved.scheduleConfig || {
                startDate: null,
                endDate: null,
                year: null,
                month: null
            },
            constraints: preserved.constraints || [],
            personalRequests: preserved.personalRequests || {},
            requestConfigs: preserved.requestConfigs || [],
            activeRequestConfigId: preserved.activeRequestConfigId || null,
            schedulePeriodConfigs: [],
            activeSchedulePeriodConfigId: null,
            fullRestConfigs: [],
            activeFullRestConfigId: null,
            monthlyShiftConfigs: [],
            activeMonthlyShiftConfigId: null,
            monthlyScheduleConfigs: [],
            activeMonthlyScheduleConfigId: null,
            nightShiftConfigs: [],
            activeNightShiftConfigId: null,
            scheduleResultConfigs: [],
            activeScheduleResultConfigId: null,
            activeDailyManpowerConfigId: null,
            minimumManpowerConfig: null,
            minimumManpowerProfiles: {},
            ruleConfigProfiles: {},
            restDays: preserved.restDays || {},
            finalSchedule: null,
            activeCityScope: this.normalizeCityScope(this.state.activeCityScope, 'ALL'),
            cityDimension: {
                enabled: true,
                defaultCity: 'SH',
                supportedCities: ['SH', 'CD']
            },
            users: Array.isArray(preserved.users) ? preserved.users : this.getDefaultUsers(),
            currentSession: preserved.currentSession || null,
            userLockContexts: preserved.userLockContexts && typeof preserved.userLockContexts === 'object'
                ? preserved.userLockContexts
                : {},
            auditLogs: Array.isArray(preserved.auditLogs) ? preserved.auditLogs : []
        };
        this.ensureUsersAndSessionShape();
        this.persistCurrentUserLockContext();
        this.saveState();
    },

    /**
     * 获取排班结果配置列表
     */
    getScheduleResultConfigs(options = {}) {
        const list = this.state.scheduleResultConfigs || [];
        if (options && options.raw === true) {
            return list;
        }
        return this.filterConfigsByCurrentUserScope(list, 'scheduleResult');
    },

    /**
     * 获取指定排班结果配置
     */
    getScheduleResultConfig(configId) {
        return (this.state.scheduleResultConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建排班结果配置
     */
    createScheduleResultConfig(name, scheduleResult, scheduleConfig = null, cityScope = null, schedulePeriodConfigId = null) {
        const now = new Date();
        const configId = `schedule_result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const linkedPeriodId = schedulePeriodConfigId || this.state.activeSchedulePeriodConfigId || null;
        const linkedPeriod = linkedPeriodId ? this.getSchedulePeriodConfig(linkedPeriodId) : null;
        const newConfig = {
            configId,
            name,
            scheduleResultSnapshot: JSON.parse(JSON.stringify(scheduleResult || {})),
            scheduleConfig: scheduleConfig ? JSON.parse(JSON.stringify(scheduleConfig)) : null,
            cityScope: this.normalizeCityScope(cityScope || (linkedPeriod && linkedPeriod.cityScope) || this.getActiveCityScope(), 'ALL'),
            schedulePeriodConfigId: linkedPeriodId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.assertCanMutate('scheduleResult', 'create', { cityScope: newConfig.cityScope });
        this.state.scheduleResultConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新排班结果配置
     */
    updateScheduleResultConfig(configId, updates, autoSave = false) {
        const config = this.getScheduleResultConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();

        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除排班结果配置
     */
    deleteScheduleResultConfig(configId) {
        const config = this.getScheduleResultConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        if (this.state.activeScheduleResultConfigId === configId) {
            this.state.activeScheduleResultConfigId = null;
        }
        this.state.scheduleResultConfigs = (this.state.scheduleResultConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
    },

    /**
     * 复制排班结果配置
     */
    duplicateScheduleResultConfig(configId, newName = null) {
        const source = this.getScheduleResultConfig(configId);
        if (!source) {
            throw new Error('配置记录不存在');
        }
        const now = new Date();
        const newConfigId = `schedule_result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const copy = {
            configId: newConfigId,
            name: newName || `${source.name} (副本)`,
            scheduleResultSnapshot: JSON.parse(JSON.stringify(source.scheduleResultSnapshot || {})),
            scheduleConfig: source.scheduleConfig ? JSON.parse(JSON.stringify(source.scheduleConfig)) : null,
            cityScope: this.normalizeCityScope(source.cityScope, 'ALL'),
            schedulePeriodConfigId: this.inferSchedulePeriodConfigId(source, 'scheduleResult'),
            staffScheduleData: source.staffScheduleData ? JSON.parse(JSON.stringify(source.staffScheduleData)) : null,
            dayShiftReport: source.dayShiftReport ? JSON.parse(JSON.stringify(source.dayShiftReport)) : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.scheduleResultConfigs.push(copy);
        this.saveState();
        return newConfigId;
    },

    /**
     * 设置激活排班结果配置
     */
    async setActiveScheduleResultConfig(configId) {
        const config = this.getScheduleResultConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        if (activeLock.valid && !this.isConfigInActiveLock(config, { configType: 'scheduleResult' })) {
            throw new Error('排班结果配置与当前激活的城市+周期不一致，无法激活');
        }
        this.state.activeScheduleResultConfigId = configId;
        this.syncActiveCityScope(config.cityScope, this.getActiveCityScope());
        this.state.finalSchedule = JSON.parse(JSON.stringify(config.scheduleResultSnapshot || {}));
        // 等待保存完成
        await this.saveState();
    },

    /**
     * 取消激活排班结果配置
     */
    async clearActiveScheduleResultConfig() {
        this.state.activeScheduleResultConfigId = null;
        this.state.finalSchedule = null;
        await this.saveState();
    },

    /**
     * ==================== 年假配额管理 ====================
     */

    /**
     * 计算员工的年假配额使用情况
     * @param {string} staffId - 员工ID
     * @returns {Object} { total: 总配额, used: 已使用, balance: 剩余 }
     */
    calculateAnnualLeaveQuota(staffId) {
        const staffData = this.getStaffData(staffId);
        if (!staffData) {
            console.warn(`calculateAnnualLeaveQuota: 员工 ${staffId} 不存在`);
            return { total: 0, used: 0, balance: 0 };
        }

        // 从员工数据中读取年假配额
        const total = staffData.annualLeaveDays || 0;

        // 统计已使用的年假（ANNUAL类型的休假）
        const personalRequests = this.state.personalRequests[staffId] || {};
        let used = 0;
        Object.values(personalRequests).forEach(status => {
            if (status === VACATION_TYPES.ANNUAL) {
                used++;
            }
        });

        const balance = Math.max(0, total - used);

        // 缓存到状态中
        this.state.annualLeaveQuotas[staffId] = { total, used, balance };

        return { total, used, balance };
    },

    /**
     * 计算员工的法定休息日配额使用情况
     * @param {string} staffId - 员工ID
     * @param {Object} schedulePeriod - 排班周期 { startDate, endDate }
     * @returns {Object} { total: 总配额, used: 已使用, balance: 剩余 }
     */
    calculateLegalRestQuota(staffId, schedulePeriod) {
        if (!schedulePeriod || !schedulePeriod.startDate || !schedulePeriod.endDate) {
            console.warn('calculateLegalRestQuota: 排班周期未设置');
            return { total: 0, used: 0, balance: 0 };
        }

        // 计算当月法定休息日天数
        const legalRestDaysCount = this.countLegalRestDaysInPeriod(schedulePeriod);

        // 统计已使用的法定休息日配额（LEGAL类型的休假）
        const personalRequests = this.state.personalRequests[staffId] || {};
        let used = 0;
        Object.entries(personalRequests).forEach(([date, status]) => {
            if (status === VACATION_TYPES.LEGAL) {
                // 检查日期是否在排班周期内
                if (date >= schedulePeriod.startDate && date <= schedulePeriod.endDate) {
                    used++;
                }
            }
        });

        const balance = Math.max(0, legalRestDaysCount - used);

        return { total: legalRestDaysCount, used, balance };
    },

    /**
     * 计算指定周期内的法定休息日天数
     * @param {Object} schedulePeriod - 排班周期 { startDate, endDate }
     * @returns {number} 法定休息日天数
     */
    countLegalRestDaysInPeriod(schedulePeriod) {
        if (!schedulePeriod || !schedulePeriod.startDate || !schedulePeriod.endDate) {
            return 0;
        }

        const { startDate, endDate } = schedulePeriod;
        const dateList = this.generateDateList(startDate, endDate);

        return dateList.filter(date => this.state.restDays[date] === true).length;
    },

    /**
     * 生成日期列表
     * @param {string} startDate - 开始日期 YYYY-MM-DD
     * @param {string} endDate - 结束日期 YYYY-MM-DD
     * @returns {Array<string>} 日期列表
     */
    generateDateList(startDate, endDate) {
        const dates = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            dates.push(`${year}-${month}-${day}`);
            current.setDate(current.getDate() + 1);
        }

        return dates;
    },

    /**
     * 获取所有员工的年假配额统计
     * @returns {Object} { staffId: { total, used, balance } }
     */
    getAllAnnualLeaveQuotas() {
        const staffList = this.getCurrentStaffData();
        const quotas = {};

        staffList.forEach(staff => {
            quotas[staff.id] = this.calculateAnnualLeaveQuota(staff.id);
        });

        return quotas;
    },

    /**
     * 批量更新所有员工的年假配额缓存
     */
    refreshAllAnnualLeaveQuotas() {
        const staffList = this.getCurrentStaffData();

        staffList.forEach(staff => {
            this.calculateAnnualLeaveQuota(staff.id);
        });

        console.log('refreshAllAnnualLeaveQuotas: 已刷新所有员工的年假配额');
    },

    /**
     * ==================== 本月排班配置管理 ====================
     */

    /**
     * 获取本月排班配置列表
     * @returns {Array} 配置列表
     */
    getMonthlyScheduleConfigs(options = {}) {
        const list = this.state.monthlyScheduleConfigs || [];
        if (options && options.raw === true) {
            return list;
        }
        return this.filterConfigsByCurrentUserScope(list, 'monthlySchedule');
    },

    replaceMonthlyScheduleConfigs(configs = [], autoSave = false, options = {}) {
        const actorEmpNo = options.actorEmpNo || 'SYSTEM_MIGRATION';
        const source = Array.isArray(configs) ? configs : [];
        this.state.monthlyScheduleConfigs = source.map((item) => {
            const row = this.deepClone(item || {});
            this.normalizeConfigMeta(row, 'monthlySchedule', { actorEmpNo, keepUpdatedAt: true });
            return row;
        });
        if (autoSave) {
            this.saveState();
        }
        return this.state.monthlyScheduleConfigs;
    },

    /**
     * 获取指定本月排班配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getMonthlyScheduleConfig(configId) {
        return (this.state.monthlyScheduleConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建本月排班配置
     * @param {string} name - 配置名称
     * @param {Object} staffScheduleData - 员工排班数据 {staffId: {staffId, staffName, shiftType, dailySchedule}, ...}
     * @returns {string} 配置ID
     */
    createMonthlyScheduleConfig(name, staffScheduleData, cityScope = null, schedulePeriodConfigId = null) {
        const now = new Date();
        const configId = `monthly_schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const linkedPeriodId = schedulePeriodConfigId || this.state.activeSchedulePeriodConfigId || null;
        const linkedPeriod = linkedPeriodId ? this.getSchedulePeriodConfig(linkedPeriodId) : null;
        const newConfig = {
            configId,
            name,
            staffScheduleData: JSON.parse(JSON.stringify(staffScheduleData || {})),
            cityScope: this.normalizeCityScope(cityScope || (linkedPeriod && linkedPeriod.cityScope) || this.getActiveCityScope(), 'ALL'),
            schedulePeriodConfigId: linkedPeriodId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.assertCanMutate('monthlySchedule', 'create', { cityScope: newConfig.cityScope });
        if (!this.state.monthlyScheduleConfigs) {
            this.state.monthlyScheduleConfigs = [];
        }
        this.state.monthlyScheduleConfigs.push(newConfig);
        return configId;
    },

    /**
     * 更新本月排班配置
     * @param {string} configId - 配置ID
     * @param {Object} updates - 要更新的字段
     */
    updateMonthlyScheduleConfig(configId, updates) {
        const config = this.getMonthlyScheduleConfig(configId);
        if (config) {
            Object.assign(config, updates);
            config.updatedAt = new Date().toISOString();
        }
    },

    /**
     * 删除本月排班配置
     * @param {string} configId - 配置ID
     */
    deleteMonthlyScheduleConfig(configId) {
        this.state.monthlyScheduleConfigs = (this.state.monthlyScheduleConfigs || []).filter(c => c.configId !== configId);
        if (this.state.activeMonthlyScheduleConfigId === configId) {
            this.state.activeMonthlyScheduleConfigId = null;
        }
    },

    /**
     * 设置激活的本月排班配置
     * @param {string} configId - 配置ID
     */
    async setActiveMonthlyScheduleConfig(configId) {
        const config = this.getMonthlyScheduleConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        if (activeLock.valid && !this.isConfigInActiveLock(config, { configType: 'monthlySchedule' })) {
            throw new Error('本月排班配置与当前激活的城市+周期不一致，无法激活');
        }
        this.state.activeMonthlyScheduleConfigId = configId;
        this.syncActiveCityScope(config.cityScope, this.getActiveCityScope());
        await this.saveState();
    },

    /**
     * 取消激活本月排班配置
     */
    async clearActiveMonthlyScheduleConfig() {
        this.state.activeMonthlyScheduleConfigId = null;
        await this.saveState();
    },

    /**
     * 获取激活的本月排班配置ID
     * @returns {string|null} 配置ID
     */
    getActiveMonthlyScheduleConfigId() {
        return this.state.activeMonthlyScheduleConfigId || null;
    },

    /**
     * 获取激活的本月排班配置
     * @returns {Object|null} 配置对象
     */
    getActiveMonthlyScheduleConfig() {
        const configId = this.state.activeMonthlyScheduleConfigId;
        return configId ? this.getMonthlyScheduleConfig(configId) : null;
    },

    /**
     * ==================== 大夜配置管理 ====================
     */

    /**
     * 获取大夜配置列表
     * @returns {Array} 配置列表
     */
    getNightShiftConfigs(options = {}) {
        const list = this.state.nightShiftConfigs || [];
        if (options && options.raw === true) {
            return list;
        }
        return this.filterConfigsByCurrentUserScope(list, 'nightShift');
    },

    replaceNightShiftConfigs(configs = [], autoSave = false, options = {}) {
        const actorEmpNo = options.actorEmpNo || 'SYSTEM_MIGRATION';
        const source = Array.isArray(configs) ? configs : [];
        this.state.nightShiftConfigs = source.map((item) => {
            const row = this.deepClone(item || {});
            this.normalizeConfigMeta(row, 'nightShift', { actorEmpNo, keepUpdatedAt: true });
            return row;
        });
        if (autoSave) {
            this.saveState();
        }
        return this.state.nightShiftConfigs;
    },

    /**
     * 获取指定大夜配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getNightShiftConfig(configId) {
        const configs = this.state.nightShiftConfigs || [];
        return configs.find(c => c.configId === configId) || null;
    },

    /**
     * 创建大夜配置
     * @param {string} name - 配置名称
     * @param {Object} nightShiftConfig - 大夜配置数据
     * @param {Object} scheduleConfig - 排班周期配置
     * @returns {string} 配置ID
     */
    createNightShiftConfig(name, nightShiftConfig, scheduleConfig, cityScope = null, schedulePeriodConfigId = null) {
        const now = new Date();
        const configId = `night_shift_config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const linkedPeriodId = schedulePeriodConfigId || this.state.activeSchedulePeriodConfigId || null;
        const linkedPeriod = linkedPeriodId ? this.getSchedulePeriodConfig(linkedPeriodId) : null;
        const newConfig = {
            configId,
            name,
            nightShiftConfig: nightShiftConfig, // 大夜配置规则（regions、constraints等）
            scheduleConfig: scheduleConfig, // 排班周期配置（startDate、endDate、year、month）
            cityScope: this.normalizeCityScope(cityScope || (linkedPeriod && linkedPeriod.cityScope) || this.getActiveCityScope(), 'ALL'),
            schedulePeriodConfigId: linkedPeriodId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.assertCanMutate('nightShift', 'create', { cityScope: newConfig.cityScope });

        // 添加到状态
        if (!this.state.nightShiftConfigs) {
            this.state.nightShiftConfigs = [];
        }
        this.state.nightShiftConfigs.push(newConfig);

        return configId;
    },

    /**
     * 更新大夜配置
     * @param {string} configId - 配置ID
     * @param {Object} updates - 更新内容
     */
    updateNightShiftConfig(configId, updates = {}) {
        const config = this.getNightShiftConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        Object.assign(config, updates || {});
        config.updatedAt = new Date().toISOString();
    },

    /**
     * 删除大夜配置
     * @param {string} configId - 配置ID
     */
    deleteNightShiftConfig(configId) {
        const beforeCount = Array.isArray(this.state.nightShiftConfigs) ? this.state.nightShiftConfigs.length : 0;
        this.state.nightShiftConfigs = (this.state.nightShiftConfigs || []).filter((c) => c && c.configId !== configId);
        const afterCount = Array.isArray(this.state.nightShiftConfigs) ? this.state.nightShiftConfigs.length : 0;
        if (beforeCount === afterCount) {
            throw new Error('配置记录不存在');
        }
        if (this.state.activeNightShiftConfigId === configId) {
            this.state.activeNightShiftConfigId = null;
        }
    },

    /**
     * 设置激活的大夜配置
     * @param {string} configId - 配置ID
     */
    async setActiveNightShiftConfig(configId) {
        const config = this.getNightShiftConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        const activeLock = this.getActiveLockContext();
        if (activeLock.valid && !this.isConfigInActiveLock(config, { configType: 'nightShift' })) {
            throw new Error('大夜配置与当前激活的城市+周期不一致，无法激活');
        }
        this.state.activeNightShiftConfigId = configId;
        this.syncActiveCityScope(config.cityScope, this.getActiveCityScope());
        await this.saveState();
    },

    /**
     * 取消激活大夜配置
     */
    async clearActiveNightShiftConfig() {
        this.state.activeNightShiftConfigId = null;
        await this.saveState();
    },

    /**
     * 获取激活的大夜配置ID
     * @returns {string|null} 配置ID
     */
    getActiveNightShiftConfigId() {
        return this.state.activeNightShiftConfigId || null;
    },

    /**
     * 获取激活的大夜配置
     * @returns {Object|null} 配置对象
     */
    getActiveNightShiftConfig() {
        const configId = this.state.activeNightShiftConfigId;
        return configId ? this.getNightShiftConfig(configId) : null;
    },

    getConfigByTypeAndId(configType, configId) {
        if (!configType || !configId) return null;
        if (configType === 'schedulePeriod') return this.getSchedulePeriodConfig(configId);
        const list = this.getConfigsByLockType(configType);
        return list.find((item) => item && item.configId === configId) || null;
    },

    getConfigLabelByType(configType) {
        if (configType === 'schedulePeriod') return '排班周期配置';
        const def = this.getLockManagedConfigTypeDefs().find((item) => item.type === configType);
        return def ? def.label : configType;
    },

    installGovernanceWrappers() {
        if (this._governanceWrapped) return;
        this._governanceWrapped = true;

        const wrap = (methodName, wrapper) => {
            const original = this[methodName];
            if (typeof original !== 'function') return;
            this[methodName] = function wrappedMethod(...args) {
                return wrapper.call(this, original.bind(this), args);
            };
        };

        const mutateMethodDefs = [
            { method: 'createStaffConfig', type: 'staff', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'duplicateStaffConfig', type: 'staff', action: 'create', idArgIndex: 0, getIdFromReturn: true },
            { method: 'updateStaffConfig', type: 'staff', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteStaffConfig', type: 'staff', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveConfig', type: 'staff', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveConfig', type: 'staff', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },

            { method: 'createRequestConfig', type: 'request', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'duplicateRequestConfig', type: 'request', action: 'create', idArgIndex: 0, getIdFromReturn: true },
            { method: 'updateRequestConfig', type: 'request', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteRequestConfig', type: 'request', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveRequestConfig', type: 'request', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveRequestConfig', type: 'request', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },

            { method: 'createSchedulePeriodConfig', type: 'schedulePeriod', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'updateSchedulePeriodConfig', type: 'schedulePeriod', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteSchedulePeriodConfig', type: 'schedulePeriod', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveSchedulePeriodConfig', type: 'schedulePeriod', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveSchedulePeriodConfig', type: 'schedulePeriod', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },

            { method: 'createFullRestConfig', type: 'fullRest', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'updateFullRestConfig', type: 'fullRest', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteFullRestConfig', type: 'fullRest', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveFullRestConfig', type: 'fullRest', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveFullRestConfig', type: 'fullRest', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },

            { method: 'createMonthlyShiftConfig', type: 'monthlyShift', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'updateMonthlyShiftConfig', type: 'monthlyShift', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteMonthlyShiftConfig', type: 'monthlyShift', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveMonthlyShiftConfig', type: 'monthlyShift', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveMonthlyShiftConfig', type: 'monthlyShift', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },

            { method: 'createMonthlyScheduleConfig', type: 'monthlySchedule', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'updateMonthlyScheduleConfig', type: 'monthlySchedule', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteMonthlyScheduleConfig', type: 'monthlySchedule', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveMonthlyScheduleConfig', type: 'monthlySchedule', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveMonthlyScheduleConfig', type: 'monthlySchedule', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },

            { method: 'createNightShiftConfig', type: 'nightShift', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'updateNightShiftConfig', type: 'nightShift', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteNightShiftConfig', type: 'nightShift', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveNightShiftConfig', type: 'nightShift', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveNightShiftConfig', type: 'nightShift', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },
            { method: 'setActiveDailyManpowerConfig', type: 'dailyManpower', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveDailyManpowerConfig', type: 'dailyManpower', action: 'deactivate', idArgIndex: null, getIdFromReturn: false },

            { method: 'createScheduleResultConfig', type: 'scheduleResult', action: 'create', idArgIndex: null, getIdFromReturn: true },
            { method: 'duplicateScheduleResultConfig', type: 'scheduleResult', action: 'create', idArgIndex: 0, getIdFromReturn: true },
            { method: 'updateScheduleResultConfig', type: 'scheduleResult', action: 'update', idArgIndex: 0, getIdFromReturn: false },
            { method: 'deleteScheduleResultConfig', type: 'scheduleResult', action: 'delete', idArgIndex: 0, getIdFromReturn: false },
            { method: 'setActiveScheduleResultConfig', type: 'scheduleResult', action: 'activate', idArgIndex: 0, getIdFromReturn: false },
            { method: 'clearActiveScheduleResultConfig', type: 'scheduleResult', action: 'deactivate', idArgIndex: null, getIdFromReturn: false }
        ];

        mutateMethodDefs.forEach((def) => {
            wrap(def.method, function instrumentMutate(original, args) {
                const targetIdBeforeCall = def.idArgIndex == null ? null : args[def.idArgIndex];
                const beforeConfig = targetIdBeforeCall ? this.deepClone(this.getConfigByTypeAndId(def.type, targetIdBeforeCall)) : null;
                const scopeHint = beforeConfig
                    ? this.normalizeCityScope(beforeConfig.cityScope, this.getActiveCityScope())
                    : this.getActiveCityScope();
                this.assertCanMutate(def.type, def.action, { cityScope: scopeHint, config: beforeConfig });
                const result = original(...args);
                const afterCall = (payload) => {
                    const targetId = def.getIdFromReturn ? payload : targetIdBeforeCall;
                    const config = targetId ? this.getConfigByTypeAndId(def.type, targetId) : null;
                    if (config) {
                        this.normalizeConfigMeta(config, def.type);
                        if (def.action === 'activate') {
                            this.markConfigActivated(config, def.type);
                        }
                        if (def.action === 'create') {
                            try {
                                this.assertUniqueConfigPerLock(def.type, targetId);
                            } catch (uniqueError) {
                                const list = def.type === 'schedulePeriod'
                                    ? (this.state.schedulePeriodConfigs || [])
                                    : this.getConfigsByLockType(def.type);
                                const idx = list.findIndex((row) => row && row.configId === targetId);
                                if (idx >= 0) {
                                    list.splice(idx, 1);
                                }
                                throw uniqueError;
                            }
                        }
                    }
                    if (def.action === 'activate' || def.action === 'deactivate' || def.action === 'create' || def.action === 'update' || def.action === 'delete') {
                        this.persistCurrentUserLockContext();
                    }
                    this.appendAuditLog({
                        action: `${def.action.toUpperCase()}_${String(def.type).toUpperCase()}`,
                        entityType: def.type,
                        entityId: targetId || null,
                        before: beforeConfig,
                        after: config || null,
                        cityScope: config ? this.normalizeCityScope(config.cityScope, this.getActiveCityScope()) : this.getActiveCityScope(),
                        lockKey: config ? (this.resolveConfigLockKey(config, { configType: def.type }) || config.lockKey || null) : null
                    });
                    if (def.action === 'create' || def.action === 'activate' || def.action === 'deactivate' || def.action === 'delete') {
                        const saveResult = this.saveState();
                        if (saveResult && typeof saveResult.catch === 'function') {
                            saveResult.catch((error) => {
                                console.error(`治理封装自动保存失败(${def.method}):`, error);
                            });
                        }
                    }
                    return payload;
                };
                if (result && typeof result.then === 'function') {
                    return result.then(afterCall);
                }
                return afterCall(result);
            });
        });

        wrap('updateState', function wrapUpdateState(original, args) {
            const result = original(...args);
            this.persistCurrentUserLockContext();
            return result;
        });
    }
};

Store.installGovernanceWrappers();

// 页面加载时自动恢复状态
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        // 等待数据库初始化
        if (typeof DB !== 'undefined') {
            try {
                await DB.init();
            } catch (error) {
                console.error('数据库初始化失败:', error);
            }
        }
        // 加载状态
        await Store.loadState();
    });
}

// 导出 Store 对象（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Store;
}
