/**
 * 本月排班配置管理器
 * 功能：显示类似休假需求管理的表格，包含员工信息和每日排班
 * 新增两列：
 * 1. 当月应上班天数 = 周期中总天数 - （法定节假日天数 + 特殊休假中使用年假的天数）
 * 2. 班别
 * 每日格子中随机填充技能排班
 */

// 防止重复渲染月度班次表
let _isUpdatingMonthlyScheduleDisplay = false;

const MonthlyScheduleConfigManager = {
    currentView: 'configs', // 'configs' 或 'scheduleEntry'
    currentConfigId: null,
    currentConfigName: '',
    displayRenderRevision: 0,
    generationStateSaveTimer: null,
    generationStateSavePromise: null,

    // 班别列表（一个月只允许一个班别）
    SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2'],

    // 技能列表（用于随机均衡填充）
    SKILL_TYPES: ['星', '综', '收', '网', '天', '微', '银B', '追', '毛'],

    normalizeCityScope(scope) {
        if (typeof Store !== 'undefined' && Store && typeof Store.normalizeCityScope === 'function') {
            return Store.normalizeCityScope(scope, 'ALL');
        }
        const value = String(scope || '').trim().toUpperCase();
        if (value === 'SH' || value === 'CD') return value;
        return 'ALL';
    },

    getCityScopeLabel(scope) {
        const normalized = this.normalizeCityScope(scope);
        if (normalized === 'SH') return '仅上海';
        if (normalized === 'CD') return '仅成都';
        return '上海+成都';
    },

    getConfigCityScope(config) {
        return this.normalizeCityScope(config && config.cityScope);
    },

    isConfigInActiveLock(config) {
        if (typeof Store !== 'undefined' && Store && typeof Store.isConfigInActiveLock === 'function') {
            return Store.isConfigInActiveLock(config, { configType: 'monthlySchedule' });
        }
        return false;
    },

    findExistingConfigInActiveLock(excludeConfigId = null) {
        const configs = Store.getMonthlyScheduleConfigs ? (Store.getMonthlyScheduleConfigs() || []) : [];
        return configs.find((config) => {
            if (!config || (excludeConfigId && config.configId === excludeConfigId)) return false;
            return this.isConfigInActiveLock(config);
        }) || null;
    },

    getStaffConfigCityScope(config) {
        if (!config || typeof config !== 'object') return 'ALL';
        if (typeof Store !== 'undefined' && Store && typeof Store.getStaffConfigEffectiveCityScope === 'function') {
            return this.normalizeCityScope(Store.getStaffConfigEffectiveCityScope(config, config.cityScope || 'ALL'));
        }
        const declaredScope = config.cityScope ? this.normalizeCityScope(config.cityScope) : null;
        const snapshot = Array.isArray(config.staffDataSnapshot) ? config.staffDataSnapshot : [];
        if (snapshot.length === 0) return declaredScope || 'ALL';
        const scopes = new Set();
        snapshot.forEach((staff) => {
            const city = String((staff && staff.city) || '').trim().toUpperCase();
            const location = String((staff && staff.location) || '').trim();
            if (city === 'CD' || location === '成都') {
                scopes.add('CD');
            } else if (city === 'SH' || location === '上海' || !city) {
                scopes.add('SH');
            }
        });
        const inferredScope = scopes.size === 1 ? Array.from(scopes)[0] : 'ALL';
        return declaredScope && declaredScope === inferredScope ? declaredScope : inferredScope;
    },

    getActivationChainContext(targetConfig = null) {
        const activeLock = (typeof Store !== 'undefined' && Store && typeof Store.getActiveLockContext === 'function')
            ? Store.getActiveLockContext()
            : null;
        if (!activeLock || !activeLock.valid || !activeLock.schedulePeriodConfigId) {
            return { ok: false, message: '请先激活一个排班周期配置' };
        }
        const activeSchedulePeriodConfig = activeLock.schedulePeriodConfig;
        if (!activeSchedulePeriodConfig || !activeSchedulePeriodConfig.scheduleConfig) {
            return { ok: false, message: '激活的排班周期配置无效' };
        }

        const activeStaffConfigId = Store.getState('activeConfigId');
        if (!activeStaffConfigId) {
            return { ok: false, message: '请先激活一个人员配置' };
        }
        const activeStaffConfig = Store.getStaffConfig(activeStaffConfigId);
        if (!activeStaffConfig) {
            return { ok: false, message: '激活的人员配置无效' };
        }

        const activeRequestConfigId = Store.getState('activeRequestConfigId');
        if (!activeRequestConfigId) {
            return { ok: false, message: '请先激活一个个性化休假配置' };
        }
        const activeRequestConfig = Store.getRequestConfig(activeRequestConfigId);
        if (!activeRequestConfig) {
            return { ok: false, message: '激活的个性化休假配置无效' };
        }

        const periodScope = this.normalizeCityScope(activeLock.cityScope);
        const staffScope = this.getStaffConfigCityScope(activeStaffConfig);
        const requestScope = this.normalizeCityScope(activeRequestConfig.cityScope);
        const staffInLock = typeof Store.isConfigInActiveLock === 'function'
            ? Store.isConfigInActiveLock(activeStaffConfig, { configType: 'staff' })
            : false;
        const requestInLock = typeof Store.isConfigInActiveLock === 'function'
            ? Store.isConfigInActiveLock(activeRequestConfig, { configType: 'request' })
            : false;
        if (periodScope !== staffScope || periodScope !== requestScope || !staffInLock || !requestInLock) {
            return {
                ok: false,
                message: '上游激活配置未绑定到同一城市+周期锁，请先统一激活链路'
            };
        }

        const activeCityScope = periodScope;

        if (targetConfig) {
            if (!this.isConfigInActiveLock(targetConfig)) {
                return {
                    ok: false,
                    message: '该配置不属于当前激活锁，归档配置仅支持查看'
                };
            }
        }

        return {
            ok: true,
            activeSchedulePeriodConfig,
            activeSchedulePeriodConfigId: activeLock.schedulePeriodConfigId,
            activeLockKey: activeLock.lockKey,
            activeCityScope,
            activeYearMonth: activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig
                ? `${activeSchedulePeriodConfig.scheduleConfig.year}${String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`
                : null
        };
    },

    findExistingConfigInCurrentLock(excludeConfigId = null) {
        return this.findExistingConfigInActiveLock(excludeConfigId);
    },

    downloadArchiveSnapshot(config, prefix = 'monthly-schedule-archive') {
        const payload = JSON.stringify(config || {}, null, 2);
        const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        anchor.href = url;
        anchor.download = `${prefix}-${stamp}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    },

    renderArchiveReadonly(config) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;
        const esc = (value) => String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const cityScope = this.getConfigCityScope(config);
        const staffCount = config && config.staffScheduleData ? Object.keys(config.staffScheduleData).length : 0;
        const periodText = (config && config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month)
            ? `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}`
            : (config && config.schedulePeriod ? config.schedulePeriod : '未绑定');
        const staffScheduleData = (config && config.staffScheduleData && typeof config.staffScheduleData === 'object')
            ? config.staffScheduleData
            : {};
        const rowsHtml = Object.entries(staffScheduleData).map(([staffId, row]) => {
            const daily = (row && row.dailySchedule && typeof row.dailySchedule === 'object') ? row.dailySchedule : {};
            const dailyEntries = Object.entries(daily).filter(([, skill]) => String(skill || '').trim() !== '');
            const skillDays = dailyEntries.length;
            const sample = dailyEntries.slice(0, 6).map(([date, skill]) => `${date}:${skill}`).join('；');
            const staffName = row && row.staffName ? row.staffName : '';
            const shiftType = row && row.shiftType ? row.shiftType : '';
            const location = row && row.location ? row.location : '';
            const keyword = `${staffId} ${staffName} ${shiftType} ${location} ${skillDays} ${sample}`.toLowerCase();
            return `
                <tr data-archive-keyword="${esc(keyword)}" class="hover:bg-gray-50">
                    <td class="px-3 py-2 text-xs text-gray-900 border border-gray-200">${esc(staffId)}</td>
                    <td class="px-3 py-2 text-xs text-gray-900 border border-gray-200">${esc(staffName)}</td>
                    <td class="px-3 py-2 text-xs text-gray-700 border border-gray-200">${esc(shiftType)}</td>
                    <td class="px-3 py-2 text-xs text-gray-700 border border-gray-200">${esc(location)}</td>
                    <td class="px-3 py-2 text-xs text-gray-900 border border-gray-200 font-medium">${skillDays}</td>
                    <td class="px-3 py-2 text-xs text-gray-600 border border-gray-200">${esc(sample)}</td>
                </tr>
            `;
        }).join('');

        scheduleTable.innerHTML = `
            <div class="p-6 space-y-4">
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h2 class="text-xl font-bold text-gray-800 mb-1">${esc(config && config.name ? config.name : '归档配置')}</h2>
                    <p class="text-sm text-amber-800">归档只读：该配置不属于当前激活的城市+周期锁，仅支持查看和导出。</p>
                    <p class="text-xs text-gray-600 mt-2">排班周期：${esc(periodText)} ｜ 城市范围：${esc(this.getCityScopeLabel(cityScope))} ｜ 员工数量：${staffCount}</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="MonthlyScheduleConfigManager.showMonthlyScheduleConfigManagement()" class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium">返回配置列表</button>
                    <button onclick="MonthlyScheduleConfigManager.downloadArchiveSnapshot(Store.getMonthlyScheduleConfig('${config.configId}'))" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">导出JSON</button>
                </div>
                <div class="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                    <input id="monthly-archive-filter" type="text" placeholder="筛选：员工ID/姓名/班别/归属地/技能日期" oninput="MonthlyScheduleConfigManager.filterArchiveTable(this.value)" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md">
                    <div class="overflow-x-auto overflow-y-auto" style="max-height: 60vh;">
                        <table class="min-w-full border-collapse">
                            <thead class="sticky top-0 bg-gray-50 z-10">
                                <tr>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">员工ID</th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">姓名</th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">班别</th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">归属地</th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">技能天数</th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">样例（前6）</th>
                                </tr>
                            </thead>
                            <tbody id="monthly-archive-tbody">
                                ${rowsHtml || '<tr><td colspan="6" class="px-3 py-6 text-center text-sm text-gray-500 border border-gray-200">暂无排班数据</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    filterArchiveTable(keyword) {
        const tbody = document.getElementById('monthly-archive-tbody');
        if (!tbody) return;
        const q = String(keyword || '').trim().toLowerCase();
        const rows = tbody.querySelectorAll('tr[data-archive-keyword]');
        rows.forEach((row) => {
            const text = String(row.getAttribute('data-archive-keyword') || '');
            row.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
    },

    async chooseCityScope(actionLabel = '新建本月排班配置', defaultScope = 'ALL') {
        const initialScope = this.normalizeCityScope(defaultScope);
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50';
            const dialog = document.createElement('div');
            dialog.className = 'bg-white rounded-lg shadow-lg w-full max-w-md p-6';
            dialog.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-800 mb-4">${actionLabel}</h3>
                <p class="text-sm text-gray-600 mb-3">请选择城市范围并绑定到本次配置。</p>
                <select id="monthly-city-scope-select" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-5">
                    <option value="SH" ${initialScope === 'SH' ? 'selected' : ''}>仅上海</option>
                    <option value="CD" ${initialScope === 'CD' ? 'selected' : ''}>仅成都</option>
                    <option value="ALL" ${initialScope === 'ALL' ? 'selected' : ''}>上海+成都</option>
                </select>
                <div class="flex justify-end space-x-3">
                    <button id="monthly-city-scope-cancel" class="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300">取消</button>
                    <button id="monthly-city-scope-ok" class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">确定</button>
                </div>
            `;
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cleanup = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };
            const cancelBtn = dialog.querySelector('#monthly-city-scope-cancel');
            const okBtn = dialog.querySelector('#monthly-city-scope-ok');
            const selectEl = dialog.querySelector('#monthly-city-scope-select');

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });
            okBtn.addEventListener('click', () => {
                const scope = this.normalizeCityScope(selectEl ? selectEl.value : initialScope);
                cleanup();
                resolve(scope);
            });
        });
    },

    getDefaultAlgorithmConfig() {
        return {
            // hybrid: MIP优先 + CSP托底
            algorithmMode: 'hybrid',
            // 严格MIP：优先选择MIP作为主解；失败时是否托底由 allowCspFallbackOnMipFailure 控制
            strictMIP: true,
            // MIP 求解异常/不可行时，自动回退 CSP 托底
            allowCspFallbackOnMipFailure: true,
            // MIP 产出存在硬约束违约时，允许用 CSP 做救援比较
            allowCspRescueWhenHardViolation: true,
            // 城市拆分策略：home_city(默认按员工归属地)、city_shift_split(按固定拆分)
            citySplitStrategy: 'home_city',
            skillTypes: ['星', '综', '收', '网', '天', '微', '银B', '追', '毛'],
            maxIterations: 1000,
            backtrackLimit: 100,
            // 白班超额上限：实际白班 - 应上白班 <= whiteShiftOverageLimit
            whiteShiftOverageLimit: 3,
            // 兼容旧字段：内部仍复用 maxExtraDayPerStaff
            maxExtraDayPerStaff: 3,
            // 应急补位可突破上限的附加天数（默认0：不突破）
            maxEmergencyExtraDayPerStaff: 0,
            // 常规修复后仍有缺班时，进行硬约束兜底补缺循环
            hardShortageRescueRounds: 2,
            // 额外加班公平：按“应上白班天数”相对均值做偏置（高目标少加班，低目标优先补位）
            extraByTargetAvgBiasEnabled: true,
            extraByTargetAvgScoreWeight: 180,
            extraOverTargetLevelPenaltyWeight: 120,
            extraCapHighTargetReduceStepDays: 2,
            extraCapHighTargetReducePerStep: 1,
            functionBalanceM: 2,
            shiftBalanceSixTotalTolerance: 1,
            functionAllocationMode: 'monthly',
            // 网/天/微均衡开关
            netTianWeiBalanceEnabled: true,
            // true: 每人网/天/微按最低人力口径比例尽量匹配；false: 仅约束其余六类职能均衡
            majorFunctionPersonalRatioEnabled: true,
            // 连续休假软目标开关
            continuousRestSoftGoalEnabled: true,
            preferredMinWorkDays: 4,
            // 当前周期按你的要求，默认设置为 4（更偏向形成连续休假块）
            preferredMinRestDays: 4,
            // 最长连续休假偏好值（软约束，仅在满足每日最低人力后尽量满足）
            preferredLongestRestDays: 4,
            minConsecutiveWorkDays: 3,
            maxConsecutiveWorkDays: 6,
            minConsecutiveRestDays: 2,
            maxConsecutiveRestDays: 4,
            maxVacationClearSteps: 300
        };
    },

    getEffectiveAlgorithmConfig(config) {
        const defaults = this.getDefaultAlgorithmConfig();
        const raw = (config && config.algorithmConfig && typeof config.algorithmConfig === 'object')
            ? config.algorithmConfig
            : {};

        const skillTypes = Array.isArray(raw.skillTypes) && raw.skillTypes.length > 0
            ? raw.skillTypes.map(s => String(s || '').trim()).filter(Boolean)
            : defaults.skillTypes.slice();

        const toInt = (v, fallback, min = 0) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(min, Math.floor(n));
        };

        const cfg = {
            algorithmMode: (() => {
                const mode = String(raw.algorithmMode || defaults.algorithmMode || 'hybrid').toLowerCase();
                if (mode === 'csp') return 'csp';
                if (mode === 'hybrid') return 'hybrid';
                return 'mip';
            })(),
            strictMIP: raw.strictMIP == null ? (defaults.strictMIP !== false) : (raw.strictMIP !== false),
            allowCspFallbackOnMipFailure: raw.allowCspFallbackOnMipFailure == null
                ? (defaults.allowCspFallbackOnMipFailure !== false)
                : (raw.allowCspFallbackOnMipFailure !== false),
            allowCspRescueWhenHardViolation: raw.allowCspRescueWhenHardViolation == null
                ? (defaults.allowCspRescueWhenHardViolation !== false)
                : (raw.allowCspRescueWhenHardViolation !== false),
            citySplitStrategy: (() => {
                const strategy = String(raw.citySplitStrategy || defaults.citySplitStrategy || 'home_city').toLowerCase();
                return ['home_city', 'city_shift_split'].includes(strategy) ? strategy : 'home_city';
            })(),
            skillTypes,
            maxIterations: toInt(raw.maxIterations, defaults.maxIterations, 10),
            backtrackLimit: toInt(raw.backtrackLimit, defaults.backtrackLimit, 1),
            whiteShiftOverageLimit: toInt(
                raw.whiteShiftOverageLimit,
                toInt(raw.maxExtraDayPerStaff, defaults.whiteShiftOverageLimit || defaults.maxExtraDayPerStaff, 0),
                0
            ),
            maxExtraDayPerStaff: toInt(
                raw.maxExtraDayPerStaff,
                toInt(raw.whiteShiftOverageLimit, defaults.whiteShiftOverageLimit || defaults.maxExtraDayPerStaff, 0),
                0
            ),
            maxEmergencyExtraDayPerStaff: toInt(raw.maxEmergencyExtraDayPerStaff, defaults.maxEmergencyExtraDayPerStaff, 0),
            hardShortageRescueRounds: toInt(raw.hardShortageRescueRounds, defaults.hardShortageRescueRounds, 0),
            extraByTargetAvgBiasEnabled: raw.extraByTargetAvgBiasEnabled == null
                ? (defaults.extraByTargetAvgBiasEnabled !== false)
                : (raw.extraByTargetAvgBiasEnabled !== false),
            extraByTargetAvgScoreWeight: toInt(raw.extraByTargetAvgScoreWeight, defaults.extraByTargetAvgScoreWeight, 0),
            extraOverTargetLevelPenaltyWeight: toInt(raw.extraOverTargetLevelPenaltyWeight, defaults.extraOverTargetLevelPenaltyWeight, 0),
            extraCapHighTargetReduceStepDays: toInt(raw.extraCapHighTargetReduceStepDays, defaults.extraCapHighTargetReduceStepDays, 1),
            extraCapHighTargetReducePerStep: toInt(raw.extraCapHighTargetReducePerStep, defaults.extraCapHighTargetReducePerStep, 0),
            functionBalanceM: toInt(raw.functionBalanceM, defaults.functionBalanceM, 0),
            shiftBalanceSixTotalTolerance: toInt(raw.shiftBalanceSixTotalTolerance, defaults.shiftBalanceSixTotalTolerance, 0),
            functionAllocationMode: String(raw.functionAllocationMode || defaults.functionAllocationMode || 'monthly').toLowerCase() === 'daily'
                ? 'daily'
                : 'monthly',
            netTianWeiBalanceEnabled: raw.majorFunctionPersonalRatioEnabled == null
                ? (
                    raw.netTianWeiBalanceEnabled == null
                        ? (defaults.netTianWeiBalanceEnabled !== false)
                        : (raw.netTianWeiBalanceEnabled !== false)
                )
                : (raw.majorFunctionPersonalRatioEnabled !== false),
            majorFunctionPersonalRatioEnabled: raw.majorFunctionPersonalRatioEnabled == null
                ? (
                    raw.netTianWeiBalanceEnabled == null
                        ? (defaults.majorFunctionPersonalRatioEnabled !== false)
                        : (raw.netTianWeiBalanceEnabled !== false)
                )
                : (raw.majorFunctionPersonalRatioEnabled !== false),
            continuousRestSoftGoalEnabled: raw.continuousRestSoftGoalEnabled == null
                ? (defaults.continuousRestSoftGoalEnabled !== false)
                : (raw.continuousRestSoftGoalEnabled !== false),
            preferredMinWorkDays: toInt(raw.preferredMinWorkDays, defaults.preferredMinWorkDays, 1),
            preferredMinRestDays: toInt(raw.preferredMinRestDays, defaults.preferredMinRestDays, 1),
            preferredLongestRestDays: toInt(raw.preferredLongestRestDays, defaults.preferredLongestRestDays, 1),
            minConsecutiveWorkDays: toInt(raw.minConsecutiveWorkDays, defaults.minConsecutiveWorkDays, 1),
            maxConsecutiveWorkDays: toInt(raw.maxConsecutiveWorkDays, defaults.maxConsecutiveWorkDays, 1),
            minConsecutiveRestDays: toInt(raw.minConsecutiveRestDays, defaults.minConsecutiveRestDays, 1),
            maxConsecutiveRestDays: toInt(raw.maxConsecutiveRestDays, defaults.maxConsecutiveRestDays, 1),
            maxVacationClearSteps: toInt(raw.maxVacationClearSteps, defaults.maxVacationClearSteps, 0)
        };

        if (cfg.maxConsecutiveWorkDays < cfg.minConsecutiveWorkDays) {
            cfg.maxConsecutiveWorkDays = cfg.minConsecutiveWorkDays;
        }
        if (cfg.maxConsecutiveRestDays < cfg.minConsecutiveRestDays) {
            cfg.maxConsecutiveRestDays = cfg.minConsecutiveRestDays;
        }
        // 白班超额上限统一使用 whiteShiftOverageLimit
        cfg.maxExtraDayPerStaff = cfg.whiteShiftOverageLimit;
        // 对外暴露统一口径开关，同时保留旧字段兼容
        cfg.majorFunctionPersonalRatioEnabled = cfg.netTianWeiBalanceEnabled;
        // 安全兜底：MIP/HYBRID 模式下，保证失败后可回退 CSP。
        if (cfg.algorithmMode !== 'csp') {
            cfg.allowCspFallbackOnMipFailure = true;
            cfg.allowCspRescueWhenHardViolation = true;
        }

        return cfg;
    },

    // 月度班次筛选状态（与个性化需求分离）
    monthlyFilterState: null,

    ensureGenerationJobsState() {
        if (typeof Store === 'undefined') {
            return {};
        }
        if (typeof Store.getMonthlyScheduleGenerationJobs === 'function') {
            return Store.getMonthlyScheduleGenerationJobs();
        }
        const current = Store.getState('monthlyScheduleGenerationJobs');
        if (!current || typeof current !== 'object') {
            Store.updateState({ monthlyScheduleGenerationJobs: {} }, false);
        }
        return Store.getState('monthlyScheduleGenerationJobs') || {};
    },

    getGenerationJob(configId = null) {
        const targetConfigId = String(configId || this.currentConfigId || '').trim();
        if (!targetConfigId) return null;
        const jobs = this.ensureGenerationJobsState();
        return jobs[targetConfigId] || null;
    },

    async waitForGenerationJobCompletion(configId, timeoutMs = 360000, pollMs = 250) {
        const targetConfigId = String(configId || '').trim();
        if (!targetConfigId) return null;
        const deadline = Date.now() + Math.max(1000, Math.floor(Number(timeoutMs) || 360000));
        const interval = Math.max(80, Math.floor(Number(pollMs) || 250));

        while (Date.now() <= deadline) {
            const job = this.getGenerationJob(targetConfigId);
            const status = String(job && job.status ? job.status : '').toLowerCase();
            if (status === 'completed') return job;
            if (status === 'failed') {
                const reason = (job && (job.message || job.summary)) ? String(job.message || job.summary) : '后台任务失败';
                throw new Error(reason);
            }
            await this.yieldToUi();
            await new Promise((resolve) => setTimeout(resolve, interval));
        }

        throw new Error('等待月度班次后台任务完成超时');
    },

    getRunningGenerationJob() {
        const jobs = this.ensureGenerationJobsState();
        const now = Date.now();
        const staleThresholdMs = 20 * 60 * 1000;
        let staleTouched = false;
        Object.keys(jobs || {}).forEach((configId) => {
            const job = jobs[configId];
            if (!job || job.status !== 'running') return;
            const ts = new Date(job.updatedAt || job.createdAt || 0).getTime();
            const isStale = !Number.isFinite(ts) || ts <= 0 || (now - ts > staleThresholdMs);
            if (!isStale) return;
            jobs[configId] = {
                ...job,
                status: 'failed',
                message: '检测到过期的后台生成任务，已自动重置，请重新发起生成',
                updatedAt: new Date().toISOString()
            };
            staleTouched = true;
        });
        if (staleTouched) {
            this.persistGenerationJobs(false);
        }
        const runningList = Object.values(jobs || {}).filter((job) => job && job.status === 'running');
        if (runningList.length <= 0) return null;
        runningList.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        return runningList[0];
    },

    buildGenerationJobStageLabel(stageKey) {
        const key = String(stageKey || '').trim();
        const map = {
            queued: '排队中',
            init: '初始化输入',
            preprocess: '预处理约束',
            solving_base: '基线求解',
            solving_adaptive: '自适应迭代求解',
            solving_repair: '最低人力修复',
            solving_finalize: '终局回填与校验',
            persisting: '写入配置',
            done: '已完成',
            failed: '失败'
        };
        return map[key] || (key || '处理中');
    },

    async persistGenerationJobs(force = false) {
        if (typeof Store === 'undefined' || typeof Store.saveState !== 'function') return;
        const runSave = async () => {
            if (this.generationStateSavePromise) {
                return this.generationStateSavePromise;
            }
            this.generationStateSavePromise = Store.saveState()
                .catch((error) => {
                    console.warn('[MonthlyScheduleConfigManager] 保存生成任务状态失败:', error);
                })
                .finally(() => {
                    this.generationStateSavePromise = null;
                });
            return this.generationStateSavePromise;
        };

        if (force) {
            if (this.generationStateSaveTimer) {
                clearTimeout(this.generationStateSaveTimer);
                this.generationStateSaveTimer = null;
            }
            await runSave();
            return;
        }
        if (this.generationStateSaveTimer) return;
        this.generationStateSaveTimer = setTimeout(() => {
            this.generationStateSaveTimer = null;
            runSave();
        }, 550);
    },

    async updateGenerationJob(configId, patch = {}, options = {}) {
        const targetConfigId = String(configId || '').trim();
        if (!targetConfigId || typeof Store === 'undefined') return null;
        const jobs = this.ensureGenerationJobsState();
        const nowIso = new Date().toISOString();
        const base = (jobs[targetConfigId] && typeof jobs[targetConfigId] === 'object')
            ? jobs[targetConfigId]
            : {
                configId: targetConfigId,
                status: 'idle',
                progress: 0,
                createdAt: nowIso
            };
        const next = {
            ...base,
            ...patch,
            configId: targetConfigId,
            updatedAt: nowIso
        };

        const progressValue = Number(next.progress);
        next.progress = Number.isFinite(progressValue) ? Math.max(0, Math.min(100, progressValue)) : 0;
        next.stageLabel = this.buildGenerationJobStageLabel(next.stageKey || next.stageLabel || '');

        if (next.status === 'running' && !next.startedAt) {
            next.startedAt = nowIso;
        }
        if ((next.status === 'completed' || next.status === 'failed' || next.status === 'cancelled') && !next.finishedAt) {
            next.finishedAt = nowIso;
        }
        jobs[targetConfigId] = next;
        Store.updateState({ monthlyScheduleGenerationJobs: jobs }, false);
        this.syncGenerationProgressDom(targetConfigId);
        const shouldRefreshList = this.currentView === 'configs'
            && (patch.status === 'running' || patch.status === 'completed' || patch.status === 'failed' || options.refreshList === true);
        if (shouldRefreshList) {
            const table = document.getElementById('scheduleTable');
            if (table) {
                this.renderConfigList(table).catch((error) => {
                    console.warn('[MonthlyScheduleConfigManager] 刷新配置列表进度失败:', error);
                });
            }
        }
        await this.persistGenerationJobs(options.persistNow === true);
        return next;
    },

    syncGenerationProgressDom(configId) {
        const targetConfigId = String(configId || '').trim();
        if (!targetConfigId) return;
        const card = document.getElementById('monthlyGenerationProgressCard');
        if (!card) return;
        if (String(card.getAttribute('data-config-id') || '') !== targetConfigId) return;
        const job = this.getGenerationJob(targetConfigId);
        if (!job) return;

        const bar = document.getElementById('monthlyGenerationProgressBar');
        const text = document.getElementById('monthlyGenerationProgressText');
        const meta = document.getElementById('monthlyGenerationProgressMeta');
        const badge = document.getElementById('monthlyGenerationProgressStatus');

        const status = String(job.status || 'idle').toLowerCase();
        const progress = Number(job.progress || 0);
        if (bar) {
            bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
            bar.className = `h-2 rounded-full transition-all duration-300 ${
                status === 'failed'
                    ? 'bg-red-500'
                    : (status === 'completed' ? 'bg-green-500' : 'bg-blue-500')
            }`;
        }
        if (text) {
            const msg = String(job.message || '').trim();
            text.textContent = msg || `${job.stageLabel || '处理中'}（${Math.round(progress)}%）`;
        }
        if (meta) {
            const startedAt = job.startedAt ? this.formatDateTime(job.startedAt) : '-';
            const updatedAt = job.updatedAt ? this.formatDateTime(job.updatedAt) : '-';
            const stage = job.stageLabel || '-';
            meta.textContent = `阶段: ${stage} | 进度: ${Math.round(progress)}% | 开始: ${startedAt} | 更新: ${updatedAt}`;
        }
        if (badge) {
            const label = status === 'running'
                ? '运行中'
                : (status === 'completed' ? '已完成' : (status === 'failed' ? '失败' : '待执行'));
            badge.textContent = label;
            badge.className = `inline-flex px-2 py-0.5 rounded text-xs ${
                status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : (status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : (status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'))
            }`;
        }
    },

    renderGenerationStatusBadge(job) {
        if (!job || typeof job !== 'object') {
            return '<span class="inline-flex px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">未执行</span>';
        }
        const status = String(job.status || 'idle').toLowerCase();
        const progress = Number.isFinite(Number(job.progress)) ? Math.round(Number(job.progress)) : 0;
        if (status === 'running') {
            return `<span class="inline-flex px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">运行中 ${progress}%</span>`;
        }
        if (status === 'completed') {
            return '<span class="inline-flex px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">已完成</span>';
        }
        if (status === 'failed') {
            return '<span class="inline-flex px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">失败</span>';
        }
        return '<span class="inline-flex px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">待执行</span>';
    },

    isViewingScheduleEntry(configId) {
        const sid = String(configId || '').trim();
        if (!sid) return false;
        if (typeof Store === 'undefined' || typeof Store.getState !== 'function') return false;
        const storeView = String(Store.getState('currentView') || '');
        const storeSubView = String(Store.getState('currentSubView') || '');
        return this.currentView === 'scheduleEntry'
            && String(this.currentConfigId || '') === sid
            && storeView === 'monthlySchedule'
            && storeSubView === 'scheduleEntry';
    },

    async refreshMonthlyViewAfterGeneration(configId) {
        const sid = String(configId || '').trim();
        if (!sid) return;
        if (typeof Store === 'undefined' || typeof Store.getState !== 'function') return;
        if (this.isViewingScheduleEntry(sid)) {
            _isUpdatingMonthlyScheduleDisplay = false;
            await this.updateMonthlyScheduleDisplay();
            return;
        }
        const storeView = String(Store.getState('currentView') || '');
        if (storeView !== 'monthlySchedule') return;
        if (this.currentView === 'configs') {
            const scheduleTable = document.getElementById('scheduleTable');
            if (scheduleTable) {
                await this.renderConfigList(scheduleTable);
            }
        }
    },

    async yieldToUi() {
        return new Promise((resolve) => setTimeout(resolve, 0));
    },

    /**
     * 显示本月排班配置管理页面
     */
    async showMonthlyScheduleConfigManagement() {
        console.log('MonthlyScheduleConfigManager.showMonthlyScheduleConfigManagement 被调用');

        // 检查 Store 是否已加载
        if (typeof Store === 'undefined') {
            console.error('MonthlyScheduleConfigManager: Store 未定义');
            alert('系统初始化未完成，请刷新页面重试');
            return;
        }

        // 更新标题
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '本月排班配置';
        }

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        // 显示配置列表
        await this.renderConfigList(scheduleTable);
    },

    /**
     * 渲染配置列表
     */
    async renderConfigList(container) {
        this.currentView = 'configs';
        let configs = Store.getMonthlyScheduleConfigs ? Store.getMonthlyScheduleConfigs() : [];

        // 如果 Store 中没有配置，尝试从 IndexedDB 加载
        if (configs.length === 0) {
            try {
                const dbConfigs = await DB.loadAllMonthlyScheduleConfigs();
                if (dbConfigs && dbConfigs.length > 0) {
                    // 同步到 Store
                    if (typeof Store.replaceMonthlyScheduleConfigs === 'function') {
                        Store.replaceMonthlyScheduleConfigs(dbConfigs, false, { actorEmpNo: 'SYSTEM_MIGRATION' });
                    } else {
                        Store.updateState({ monthlyScheduleConfigs: dbConfigs }, false);
                    }
                    if (typeof Store.applyCityDimensionMigration === 'function') {
                        const migrated = Store.applyCityDimensionMigration();
                        if (migrated && typeof Store.saveState === 'function') {
                            await Store.saveState();
                        }
                    }
                    configs = Store.getMonthlyScheduleConfigs ? Store.getMonthlyScheduleConfigs() : dbConfigs;
                    console.log('已从 IndexedDB 加载本月排班配置:', configs.length, '个');
                }
            } catch (error) {
                console.error('从 IndexedDB 加载配置失败:', error);
            }
        }

        const activeConfigId = Store.getState('activeMonthlyScheduleConfigId');

        // 获取当前激活的排班周期
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        let currentYearMonth = null;
        if (activeSchedulePeriodConfigId) {
            const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig) {
                const { year, month } = activeSchedulePeriodConfig.scheduleConfig;
                currentYearMonth = `${year}${String(month).padStart(2, '0')}`;
            }
        }
        if (activeConfigId) {
            const activeConfig = configs.find((cfg) => cfg && cfg.configId === activeConfigId);
            if (activeConfig && !currentYearMonth && activeConfig.scheduleConfig) {
                currentYearMonth = `${activeConfig.scheduleConfig.year}${String(activeConfig.scheduleConfig.month).padStart(2, '0')}`;
            }
        }
        const chainContext = this.getActivationChainContext();
        const chainCityScope = chainContext.ok
            ? this.normalizeCityScope(chainContext.activeCityScope)
            : null;

        // 按锁展示全部配置，归档只读。
        const filteredConfigs = configs;
        const existingInActiveLock = chainContext.ok ? this.findExistingConfigInActiveLock() : null;
        const canCreate = chainContext.ok && !existingInActiveLock;
        let createHint = '新建将按“城市+周期锁唯一”校验';
        if (!chainContext.ok) {
            createHint = chainContext.message;
        } else if (existingInActiveLock) {
            createHint = `当前激活锁已存在配置：${existingInActiveLock.name}，请先删除后再新建`;
        }
        const createHintEscaped = String(createHint || '').replace(/"/g, '&quot;');

        let html = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">本月排班配置管理</h2>
                    <div class="flex space-x-3">
                        <button onclick="MonthlyScheduleConfigManager.createNewConfig()"
                            ${canCreate ? '' : 'disabled'}
                            title="${createHintEscaped}"
                            class="px-4 py-2 text-white rounded-lg flex items-center space-x-2 ${canCreate ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                            </svg>
                            <span>新建配置</span>
                        </button>
                    </div>
                </div>

                <div class="mb-4">
                    <p class="text-sm text-gray-600">当前排班周期: ${currentYearMonth || '未设置'}${chainCityScope ? `｜上游激活城市: ${this.getCityScopeLabel(chainCityScope)}` : ''}</p>
                </div>
        `;

        if (filteredConfigs.length === 0) {
            html += `
                <div class="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <h3 class="text-lg font-semibold text-gray-700 mb-2">暂无本月排班配置</h3>
                    <p class="text-gray-500 mb-4">${canCreate ? '可创建当前锁本月排班配置' : createHint}</p>
                    <button onclick="MonthlyScheduleConfigManager.createNewConfig()"
                        ${canCreate ? '' : 'disabled'}
                        title="${createHintEscaped}"
                        class="px-6 py-2 text-white rounded-lg ${canCreate ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}">
                        创建配置
                    </button>
                </div>
            `;
        } else {
            html += `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">YYYYMM</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">城市范围</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配置名称</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">员工数量</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">排班周期</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最晚修改时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;

            // 按创建时间倒序排列
            const sortedConfigs = [...filteredConfigs].sort((a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
            );

            sortedConfigs.forEach((config) => {
                const isActive = config.configId === activeConfigId;
                const schedulePeriod = config.schedulePeriod || '未设置';
                const staffCount = config.staffScheduleData ? Object.keys(config.staffScheduleData).length : 0;
                const generationJob = this.getGenerationJob(config.configId);
                const configCityScope = this.getConfigCityScope(config);
                const rowOperateAllowed = chainContext.ok && this.isConfigInActiveLock(config);
                const rowOperateHint = rowOperateAllowed
                    ? ''
                    : (!chainContext.ok
                        ? createHint
                        : '归档配置仅支持查看，不可编辑/导入/激活');
                const rowOperateHintEscaped = String(rowOperateHint || '').replace(/"/g, '&quot;');

                // 获取YYYYMM展示栏位
                let yearMonthDisplay = '-';
                if (config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month) {
                    yearMonthDisplay = `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}`;
                }

                html += `
                    <tr class="${isActive ? 'bg-blue-50' : ''}">
                        <td class="px-4 py-3 whitespace-nowrap">
                            <span class="text-sm font-bold text-gray-900">${yearMonthDisplay}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            <span class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">${this.getCityScopeLabel(this.getConfigCityScope(config))}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            <span class="text-sm font-medium text-gray-900">${config.name}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${staffCount} 人</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${schedulePeriod}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.createdAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.updatedAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            <div class="flex flex-col gap-1">
                                ${isActive
                                    ? `<span class="px-2 py-1 rounded bg-green-500 text-white text-xs font-medium inline-flex w-fit">已激活</span>`
                                    : `<span class="text-gray-400 text-xs">未激活</span>`
                                }
                                ${this.renderGenerationStatusBadge(generationJob)}
                            </div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            <div class="flex items-center space-x-2">
                                ${!isActive ? `
                                    <button onclick="MonthlyScheduleConfigManager.activateConfig('${config.configId}')"
                                        ${rowOperateAllowed ? '' : 'disabled'}
                                        title="${rowOperateHintEscaped}"
                                        class="${rowOperateAllowed ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'} font-medium">
                                        激活
                                    </button>
                                ` : `
                                    <button onclick="MonthlyScheduleConfigManager.deactivateConfig()"
                                        class="text-orange-600 hover:text-orange-800 font-medium">
                                        取消激活
                                    </button>
                                `}
                                <button onclick="MonthlyScheduleConfigManager.viewScheduleEntry('${config.configId}')"
                                    class="text-blue-600 hover:text-blue-800 font-medium">
                                    查看
                                </button>
                                <button onclick="MonthlyScheduleConfigManager.deleteConfig('${config.configId}')"
                                    class="text-red-600 hover:text-red-800 font-medium">
                                    删除
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;
        }

        html += `</div>`;

        container.innerHTML = html;
        updateStatus('配置列表已加载', 'success');
    },

    /**
     * 创建新配置
     */
    async createNewConfig() {
        try {
            const chainContext = this.getActivationChainContext();
            if (!chainContext.ok) {
                alert(chainContext.message);
                return;
            }
            const activeSchedulePeriodConfigId = chainContext.activeSchedulePeriodConfigId;
            const activeSchedulePeriodConfig = chainContext.activeSchedulePeriodConfig;
            const targetCityScope = this.normalizeCityScope(chainContext.activeCityScope);
            const yearMonth = `${activeSchedulePeriodConfig.scheduleConfig.year}${String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`;
            const existing = this.findExistingConfigInCurrentLock();
            if (existing) {
                alert(`当前激活锁已存在本月排班配置：${existing.name}。请先删除后再新建。`);
                return;
            }

            // 检查是否有人员配置
            const activeStaffConfigId = Store.getState('activeConfigId');
            if (!activeStaffConfigId) {
                alert('请先激活一个人员配置');
                return;
            }

            const activeStaffConfig = Store.getStaffConfig(activeStaffConfigId);
            if (!activeStaffConfig || !activeStaffConfig.staffDataSnapshot) {
                alert('未找到激活的人员配置数据');
                return;
            }

            // 生成配置名称
            const now = new Date();
            const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const name = `本月排班配置-${timestamp}`;

            // 创建空的排班数据结构
            const staffScheduleData = {};

            // 初始化所有员工的排班数据
            activeStaffConfig.staffDataSnapshot.forEach(staff => {
                const staffId = staff.staffId || staff.id;
                const normalizedStaff = (typeof CityUtils !== 'undefined' && CityUtils.normalizeStaffCityFields)
                    ? CityUtils.normalizeStaffCityFields(staff || {}, 'SH')
                    : ({
                        ...(staff || {}),
                        city: String(staff && staff.city ? staff.city : '').trim().toUpperCase() === 'CD' ? 'CD' : 'SH',
                        location: String(staff && staff.location ? staff.location : '').trim() === '成都' ? '成都' : '上海'
                    });
                staffScheduleData[staffId] = {
                    staffId: staffId,
                    staffName: staff.staffName || staff.name,
                    city: normalizedStaff.city,
                    location: normalizedStaff.location,
                    // 新建配置时不预填班别，避免“未生成前看起来已经排好了”
                    shiftType: '',
                    dailySchedule: {} // 每日排班数据
                };
            });

            // 保存排班周期信息
            const schedulePeriod = activeSchedulePeriodConfig.schedulePeriod ||
                `${activeSchedulePeriodConfig.scheduleConfig.startDate} 至 ${activeSchedulePeriodConfig.scheduleConfig.endDate}`;

            const configId = Store.createMonthlyScheduleConfig(
                name,
                staffScheduleData,
                targetCityScope,
                activeSchedulePeriodConfigId
            );

            Store.updateMonthlyScheduleConfig(configId, {
                schedulePeriod: schedulePeriod,
                scheduleConfig: {
                    startDate: activeSchedulePeriodConfig.scheduleConfig.startDate,
                    endDate: activeSchedulePeriodConfig.scheduleConfig.endDate,
                    year: activeSchedulePeriodConfig.scheduleConfig.year,
                    month: activeSchedulePeriodConfig.scheduleConfig.month
                },
                algorithmConfig: this.getDefaultAlgorithmConfig(),
                shiftTypeEditedManually: false
            });

            const configData = Store.getMonthlyScheduleConfig(configId);
            if (!configData) {
                throw new Error('创建配置后读取失败');
            }

            // 保存到IndexedDB
            await DB.saveMonthlyScheduleConfig(configData);

            // 激活该配置
            await Store.setActiveMonthlyScheduleConfig(configId);

            // 保存状态
            await Store.saveState();

            // 显示排班录入页面
            await this.viewScheduleEntry(configId);

            updateStatus('配置已创建', 'success');
        } catch (error) {
            console.error('createNewConfig 失败:', error);
            alert('创建失败：' + error.message);
        }
    },

    /**
     * 查看排班录入页面（类似休假需求管理的表格）
     */
    async viewScheduleEntry(configId) {
        console.log('viewScheduleEntry 被调用，configId:', configId);

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        try {
            // 获取配置
            const config = Store.getMonthlyScheduleConfig
                ? Store.getMonthlyScheduleConfig(configId)
                : null;

            if (!config) {
                alert('配置不存在');
                return;
            }
            if (!this.isConfigInActiveLock(config)) {
                this.currentConfigId = configId;
                this.currentConfigName = config.name || '';
                this.currentView = 'archiveView';
                Store.updateState({
                    currentView: 'monthlySchedule',
                    currentSubView: 'archiveView',
                    currentConfigId: configId
                }, false);
                this.renderArchiveReadonly(config);
                return;
            }
            const chainContext = this.getActivationChainContext(config);
            if (!chainContext.ok) {
                alert(chainContext.message);
                return;
            }

            // 获取排班周期
            const scheduleConfig = config.scheduleConfig;
            if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
                alert('排班周期未配置');
                return;
            }

            // 获取人员配置
            const activeStaffConfigId = Store.getState('activeConfigId');
            if (!activeStaffConfigId) {
                alert('请先激活人员配置');
                return;
            }

            const activeStaffConfig = Store.getStaffConfig(activeStaffConfigId);
            if (!activeStaffConfig || !activeStaffConfig.staffDataSnapshot) {
                alert('未找到人员配置数据');
                return;
            }

            // 保存当前配置ID和名称
            this.currentConfigId = configId;
            this.currentConfigName = config.name;
            this.currentView = 'scheduleEntry';
            this.displayRenderRevision = Number(this.displayRenderRevision || 0) + 1;
            if (typeof Store.setActiveCityScope === 'function') {
                await Store.setActiveCityScope(this.getConfigCityScope(config), false);
            }

            // 临时加载排班周期配置到Store（供updateStaffDisplay使用）
            Store.updateState({
                scheduleConfig: scheduleConfig
            });

            // 记录当前视图状态（避免和个性化需求混淆）
            Store.updateState({
                currentView: 'monthlySchedule',
                currentSubView: 'scheduleEntry',
                currentConfigId: configId
            }, false);

            // 显示加载提示
            scheduleTable.innerHTML = `
                <div class="p-8 text-center">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p class="mt-4 text-gray-600">正在加载排班表格...</p>
                </div>
            `;

            // 延迟调用updateMonthlyScheduleDisplay，确保Store状态已更新
            setTimeout(() => {
                if (typeof MonthlyScheduleConfigManager.updateMonthlyScheduleDisplay === 'function') {
                    MonthlyScheduleConfigManager.updateMonthlyScheduleDisplay();
                } else {
                    console.error('updateMonthlyScheduleDisplay 函数未定义');
                    alert('系统函数未加载，请刷新页面重试');
                }
            }, 100);

        } catch (error) {
            console.error('viewScheduleEntry 失败:', error);
            alert('加载排班录入页面失败：' + error.message);
        }
    },

    /**
     * 渲染排班表格（已弃用 - 现在使用 updateStaffDisplay() 来渲染）
     * 保留此方法以防旧代码调用
     */
    async renderScheduleTable(container, config, staffData, dateList) {
        console.warn('renderScheduleTable() 已弃用，现在使用 updateStaffDisplay() 来渲染表格');
        // 不再使用此方法，表格由 updateStaffDisplay() 渲染
    },

    /**
     * 随机获取班别
     */
    getRandomShiftType() {
        const shiftTypes = ['A1', 'A', 'A2', 'B1', 'B2'];
        return shiftTypes[Math.floor(Math.random() * shiftTypes.length)];
    },

    /**
     * 更新班别
     */
    async updateShiftType(configId, staffId, newShiftType) {
        console.log('更新班别:', staffId, newShiftType);

        const config = Store.getMonthlyScheduleConfig
            ? Store.getMonthlyScheduleConfig(configId)
            : null;

        if (config && config.staffScheduleData && config.staffScheduleData[staffId]) {
            config.staffScheduleData[staffId].shiftType = newShiftType;
            config.shiftTypeEditedManually = true;
            // 手工调整班别后，算法快照已失效，后续统计改按当前表格数据计算
            config.scheduleResultSnapshot = null;
            if (typeof Store.updateMonthlyScheduleConfig === 'function') {
                Store.updateMonthlyScheduleConfig(configId, {
                    staffScheduleData: config.staffScheduleData,
                    shiftTypeEditedManually: true,
                    scheduleResultSnapshot: null
                });
            } else {
                config.updatedAt = new Date().toISOString();
            }

            // 保存到IndexedDB
            await DB.saveMonthlyScheduleConfig(config);
            
            // 保存Store状态
            await Store.saveState();

            updateStatus('班别已更新', 'success');
            await this.updateMonthlyScheduleDisplay();
        }
    },

    /**
     * 更新技能
     */
    async updateSkill(configId, staffId, dateStr, newSkill) {
        console.log('更新技能:', staffId, dateStr, newSkill);

        const config = Store.getMonthlyScheduleConfig
            ? Store.getMonthlyScheduleConfig(configId)
            : null;

        if (config && config.staffScheduleData && config.staffScheduleData[staffId]) {
            config.staffScheduleData[staffId].dailySchedule[dateStr] = newSkill;
            if (typeof Store.updateMonthlyScheduleConfig === 'function') {
                Store.updateMonthlyScheduleConfig(configId, {
                    staffScheduleData: config.staffScheduleData
                });
            } else {
                config.updatedAt = new Date().toISOString();
            }

            // 保存到IndexedDB
            await DB.saveMonthlyScheduleConfig(config);

            updateStatus('技能已更新', 'success');
        }
    },

    /**
     * 激活配置
     */
    async activateConfig(configId) {
        try {
            const config = Store.getMonthlyScheduleConfig
                ? Store.getMonthlyScheduleConfig(configId)
                : null;
            if (!config) {
                alert('配置不存在');
                return;
            }
            const chainContext = this.getActivationChainContext(config);
            if (!chainContext.ok) {
                alert(chainContext.message);
                return;
            }
            await Store.setActiveMonthlyScheduleConfig(configId);
            await this.renderConfigList(document.getElementById('scheduleTable'));
            updateStatus('配置已激活', 'success');
        } catch (error) {
            alert('激活失败：' + error.message);
        }
    },

    /**
     * 取消激活配置
     */
    async deactivateConfig() {
        if (!Store.getState('activeMonthlyScheduleConfigId')) {
            alert('当前没有激活的本月排班配置');
            return;
        }
        if (!confirm('确定要取消激活当前本月排班配置吗？')) {
            return;
        }

        try {
            if (typeof Store.clearActiveMonthlyScheduleConfig !== 'function') {
                throw new Error('Store.clearActiveMonthlyScheduleConfig 不可用');
            }
            await Store.clearActiveMonthlyScheduleConfig();
            await this.renderConfigList(document.getElementById('scheduleTable'));
            updateStatus('已取消激活', 'success');
        } catch (error) {
            alert('取消激活失败：' + error.message);
        }
    },

    /**
     * 删除配置
     */
    async deleteConfig(configId) {
        const configs = Store.getMonthlyScheduleConfigs ? (Store.getMonthlyScheduleConfigs() || []) : [];
        const config = configs.find(c => c.configId === configId);
        const isActive = config && config.configId === Store.getState('activeMonthlyScheduleConfigId');

        let confirmMessage = '确定要删除这个配置吗？此操作不可恢复。';
        if (isActive) {
            if (configs.length === 1) {
                confirmMessage = '这是最后一个配置，删除后将没有激活的配置。确定要删除吗？';
            } else {
                confirmMessage = '这是当前激活的配置，删除后需要激活其他配置。确定要删除吗？';
            }
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            if (typeof Store.deleteMonthlyScheduleConfig !== 'function') {
                throw new Error('Store.deleteMonthlyScheduleConfig 不可用');
            }
            Store.deleteMonthlyScheduleConfig(configId);

            // 从IndexedDB删除
            await DB.deleteMonthlyScheduleConfig(configId);

            // 【修复】保存Store状态，确保删除操作持久化
            await Store.saveState();

            // 重新渲染
            await this.renderConfigList(document.getElementById('scheduleTable'));
            updateStatus('配置已删除', 'success');
        } catch (error) {
            alert('删除失败：' + error.message);
        }
    },

    /**
     * 返回配置列表
     */
    async backToConfigList() {
        this.currentView = 'configs';
        this.currentConfigId = null;
        this.currentConfigName = '';
        this.displayRenderRevision = Number(this.displayRenderRevision || 0) + 1;
        if (typeof Store !== 'undefined' && typeof Store.updateState === 'function') {
            Store.updateState({
                currentView: 'monthlySchedule',
                currentSubView: 'configs',
                currentConfigId: null
            }, false);
        }
        await this.showMonthlyScheduleConfigManagement();
    },

    /**
     * 获取当前配置
     */
    getCurrentConfig() {
        if (!this.currentConfigId) {
            return null;
        }
        return Store.getMonthlyScheduleConfig
            ? Store.getMonthlyScheduleConfig(this.currentConfigId)
            : null;
    },

    getSupportedLocations() {
        if (typeof CityUtils !== 'undefined' && CityUtils.getAllLocationNames) {
            return CityUtils.getAllLocationNames();
        }
        return ['上海', '成都'];
    },

    /**
     * 初始化月度班次筛选状态
     */
    initMonthlyFilterState() {
        if (typeof StaffFilter !== 'undefined' && StaffFilter.initFilterState) {
            return StaffFilter.initFilterState();
        }
        return {
            personTypes: ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'],
            locations: this.getSupportedLocations(),
            idFilter: '',
            nameFilter: ''
        };
    },

    /**
     * 获取月度班次筛选状态
     */
    getMonthlyFilterState() {
        if (!this.monthlyFilterState) {
            this.monthlyFilterState = this.initMonthlyFilterState();
        }
        return this.monthlyFilterState;
    },

    /**
     * 应用月度班次筛选
     */
    applyMonthlyScheduleFilter() {
        const filterState = this.getMonthlyFilterState();
        const idInput = document.getElementById('filterId');
        const nameInput = document.getElementById('filterName');

        if (idInput) {
            filterState.idFilter = idInput.value || '';
        }
        if (nameInput) {
            filterState.nameFilter = nameInput.value || '';
        }

        _isUpdatingMonthlyScheduleDisplay = false;
        this.updateMonthlyScheduleDisplay();
    },

    /**
     * 清除月度班次筛选
     */
    clearMonthlyScheduleFilter() {
        this.monthlyFilterState = this.initMonthlyFilterState();
        _isUpdatingMonthlyScheduleDisplay = false;
        this.updateMonthlyScheduleDisplay();
    },

    /**
     * 切换归属地下拉列表显示
     */
    toggleLocationFilterDropdown() {
        const dropdown = document.getElementById('filterLocationDropdown');
        const personTypeDropdown = document.getElementById('filterPersonTypeDropdown');
        if (dropdown) {
            if (personTypeDropdown) {
                personTypeDropdown.classList.add('hidden');
            }
            dropdown.classList.toggle('hidden');
        }
    },

    /**
     * 切换人员类型下拉列表显示
     */
    togglePersonTypeFilterDropdown() {
        const dropdown = document.getElementById('filterPersonTypeDropdown');
        const locationDropdown = document.getElementById('filterLocationDropdown');
        if (dropdown) {
            if (locationDropdown) {
                locationDropdown.classList.add('hidden');
            }
            dropdown.classList.toggle('hidden');
        }
    },

    /**
     * 切换归属地全部选择
     */
    toggleLocationFilterAll(checkbox) {
        // 当前归属地筛选为只读展示，保持全选即可
        this.updateLocationFilter();
    },

    /**
     * 更新归属地筛选
     */
    updateLocationFilter() {
        const filterState = this.getMonthlyFilterState();
        filterState.locations = this.getSupportedLocations();
        _isUpdatingMonthlyScheduleDisplay = false;
        this.updateMonthlyScheduleDisplay();
    },

    /**
     * 切换人员类型全部选择
     */
    togglePersonTypeFilterAll(checkbox) {
        const type1 = document.getElementById('filterPersonType1');
        const type2 = document.getElementById('filterPersonType2');
        const type3 = document.getElementById('filterPersonType3');
        const type4 = document.getElementById('filterPersonType4');

        if (checkbox.checked) {
            if (type1) type1.checked = true;
            if (type2) type2.checked = true;
            if (type3) type3.checked = true;
            if (type4) type4.checked = true;
        } else {
            if (type1) type1.checked = true;
            if (type2) type2.checked = false;
            if (type3) type3.checked = false;
            if (type4) type4.checked = false;
        }
        this.updatePersonTypeFilter();
    },

    /**
     * 更新人员类型筛选
     */
    updatePersonTypeFilter() {
        const filterState = this.getMonthlyFilterState();
        const type1 = document.getElementById('filterPersonType1');
        const type2 = document.getElementById('filterPersonType2');
        const type3 = document.getElementById('filterPersonType3');
        const type4 = document.getElementById('filterPersonType4');
        const all = document.getElementById('filterPersonTypeAll');
        const display = document.getElementById('filterPersonTypeDisplay');

        const selected = [];
        if (type1 && type1.checked) selected.push('全人力侦测');
        if (type2 && type2.checked) selected.push('半人力授权+侦测');
        if (type3 && type3.checked) selected.push('全人力授权+大夜侦测');
        if (type4 && type4.checked) selected.push('授权人员支援侦测+大夜授权');

        if (all) {
            all.checked = selected.length === 4;
        }
        if (display) {
            display.value = selected.length === 4 ? '全部' : selected.join(', ');
        }

        filterState.personTypes = selected;
        _isUpdatingMonthlyScheduleDisplay = false;
        this.updateMonthlyScheduleDisplay();
    },

    /**
     * 渲染月度班次配置表
     */
    async updateMonthlyScheduleDisplay() {
        if (_isUpdatingMonthlyScheduleDisplay) {
            console.warn('updateMonthlyScheduleDisplay: 正在执行中，跳过重复调用');
            return;
        }

        // 仅在“月度排班详情”子视图内允许渲染，避免后台任务把列表页再次覆盖为详情页。
        const currentView = typeof Store !== 'undefined' && typeof Store.getState === 'function'
            ? String(Store.getState('currentView') || '')
            : '';
        const currentSubView = typeof Store !== 'undefined' && typeof Store.getState === 'function'
            ? String(Store.getState('currentSubView') || '')
            : '';
        if (this.currentView !== 'scheduleEntry' || currentView !== 'monthlySchedule' || currentSubView !== 'scheduleEntry') {
            return;
        }

        _isUpdatingMonthlyScheduleDisplay = true;
        const renderRevision = Number(this.displayRenderRevision || 0);

        try {
            const scheduleTable = document.getElementById('scheduleTable');
            const scheduleConfig = Store.getState('scheduleConfig');
            const isStillScheduleEntryView = () => {
                const liveCurrentView = typeof Store !== 'undefined' && typeof Store.getState === 'function'
                    ? String(Store.getState('currentView') || '')
                    : '';
                const liveCurrentSubView = typeof Store !== 'undefined' && typeof Store.getState === 'function'
                    ? String(Store.getState('currentSubView') || '')
                    : '';
                return this.currentView === 'scheduleEntry'
                    && liveCurrentView === 'monthlySchedule'
                    && liveCurrentSubView === 'scheduleEntry'
                    && Number(this.displayRenderRevision || 0) === renderRevision;
            };
            const setScheduleTableHtml = (html) => {
                if (!isStillScheduleEntryView()) return false;
                scheduleTable.innerHTML = html;
                return true;
            };

            if (!scheduleTable) {
                console.warn('updateMonthlyScheduleDisplay: scheduleTable 未找到');
                return;
            }
            if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
                setScheduleTableHtml(`
                    <div class="p-8 text-center text-gray-400">
                        <p>请先配置排班周期</p>
                    </div>
                `);
                return;
            }

            const config = this.getCurrentConfig();
            if (!config) {
                setScheduleTableHtml(`
                    <div class="p-8 text-center text-gray-400">
                        <p>未找到月度班次配置，请返回配置列表重试</p>
                    </div>
                `);
                return;
            }

            const algoConfig = this.getEffectiveAlgorithmConfig(config);
            this.SKILL_TYPES = algoConfig.skillTypes.slice();
            config.algorithmConfig = algoConfig;

            const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
            const allStaffData = Store.getCurrentStaffData() || [];

            if (allStaffData.length === 0) {
                setScheduleTableHtml(`
                    <div class="p-8 text-center text-gray-400">
                        <p>请先上传人员数据</p>
                    </div>
                `);
                return;
            }

            // 确保所有人员都有排班数据结构
            if (!config.staffScheduleData) {
                config.staffScheduleData = {};
            }
            allStaffData.forEach(staff => {
                const staffId = staff.staffId || staff.id;
                if (!config.staffScheduleData[staffId]) {
                    config.staffScheduleData[staffId] = {
                        staffId: staffId,
                        staffName: staff.staffName || staff.name,
                        shiftType: '',
                        dailySchedule: {}
                    };
                } else if (!config.staffScheduleData[staffId].dailySchedule) {
                    config.staffScheduleData[staffId].dailySchedule = {};
                }
            });

            // 兼容旧配置：历史版本会在新建/打开时随机预填所有班别。
            // 对“未生成、无日排班、全部班别非空、且未手工编辑过”的配置，自动清空这些占位班别。
            const shouldAutoClearLegacyShiftTypes =
                config.shiftTypeEditedManually !== true
                && !(config.dayShiftReport && config.dayShiftReport.stats)
                && !(config.scheduleResultSnapshot && Object.keys(config.scheduleResultSnapshot || {}).length > 0);
            if (shouldAutoClearLegacyShiftTypes) {
                const rows = Object.values(config.staffScheduleData || {});
                const allShiftPrefilled = rows.length > 0 && rows.every((row) => {
                    const shiftType = String((row && row.shiftType) || '').trim();
                    return this.SHIFT_TYPES.includes(shiftType);
                });
                const allDailyEmpty = rows.every((row) => {
                    const daily = (row && row.dailySchedule && typeof row.dailySchedule === 'object')
                        ? row.dailySchedule
                        : {};
                    return Object.keys(daily).length === 0;
                });
                if (allShiftPrefilled && allDailyEmpty) {
                    rows.forEach((row) => {
                        row.shiftType = '';
                    });
                    config.updatedAt = new Date().toISOString();
                    try {
                        await DB.saveMonthlyScheduleConfig(config);
                        await Store.saveState();
                    } catch (saveError) {
                        console.warn('清理历史随机班别占位失败:', saveError);
                    }
                }
            }

            // 计算法定节假日数量（基于排班周期管理配置）
            const restDaysMap = {};
            dateList.forEach(d => {
                restDaysMap[d.dateStr] = Store.isRestDay(d.dateStr);
            });
            const restDayCount = Object.values(restDaysMap).filter(v => v).length;

            // 特殊节假日识别 + 连通休假判定
            const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday.bind(HolidayManager) : (typeof isFixedHoliday === 'function' ? isFixedHoliday : () => false);
            const lunarHolidayFn = typeof LunarHolidays !== 'undefined' ? LunarHolidays.getHoliday.bind(LunarHolidays) : null;
            const specialFlags = {};
            const specialSet = new Set();
            dateList.forEach(d => {
                const holidayName = d.holidayName || '';
                const lunarHoliday = lunarHolidayFn ? lunarHolidayFn(d.dateStr) : null;
                const isSpecial = !!holidayName || isFixedHolidayFn(d.dateStr) || !!lunarHoliday;
                specialFlags[d.dateStr] = isSpecial;
                if (isSpecial) {
                    specialSet.add(d.dateStr);
                }
            });
            const connectedToSpecial = new Array(dateList.length).fill(false);
            const restFlags = dateList.map(d => restDaysMap[d.dateStr] === true);
            for (let i = 1; i < dateList.length; i++) {
                if (restFlags[i] && restFlags[i - 1] && (specialSet.has(dateList[i - 1].dateStr) || connectedToSpecial[i - 1])) {
                    connectedToSpecial[i] = true;
                }
            }
            for (let i = dateList.length - 2; i >= 0; i--) {
                if (restFlags[i] && restFlags[i + 1] && (specialSet.has(dateList[i + 1].dateStr) || connectedToSpecial[i + 1])) {
                    connectedToSpecial[i] = true;
                }
            }

            // 读取大夜排班（优先从 NightShiftManager.currentSchedule 读取完整格式，再尝试其他来源）
            // 【修复】同时记录大夜和休整期，区分类型: 'night' 或 'rest'
            // 【关键修复】同一员工同一天若同时存在“大夜+休整”记录，统一按照业务优先级合并：
            // 1）只要有大夜记录，则视为大夜；2）否则若有休整记录，则视为休整。
            const nightShiftMap = {};
            
            // 【新增】辅助函数：处理单个 assignment
            const processAssignment = (staffId, dateStr, shiftType, isPostShiftRest = false) => {
                if (!staffId || !dateStr) return;
                const sid = String(staffId).trim();
                if (!sid) return;

                if (!nightShiftMap[sid]) {
                    nightShiftMap[sid] = {};
                }

                const prevType = nightShiftMap[sid][dateStr]; // 之前已判定的类型（'night' | 'rest'）

                // 统一判断当前记录是“大夜”还是“休整”
                const isNight =
                    shiftType === 'night' ||
                    shiftType === 'NIGHT';
                const isRest =
                    shiftType === 'rest' ||
                    isPostShiftRest === true;

                let currentType = null;
                if (isNight) {
                    currentType = 'night';
                } else if (isRest) {
                    currentType = 'rest';
                }

                // 无效记录，直接跳过
                if (!currentType) return;

                // 合并规则：
                // - 若之前已经判为大夜（night），保持大夜，不被休整覆盖；
                // - 若之前为空，或之前是休整，而当前是大夜，则覆盖为大夜；
                // - 若之前为空且当前是休整，则记录为休整。
                if (prevType === 'night') {
                    return; // 已经是最高优先级，不变
                }
                if (currentType === 'night') {
                    nightShiftMap[sid][dateStr] = 'night';
                } else if (!prevType) {
                    nightShiftMap[sid][dateStr] = 'rest';
                }
            };
            
            const applyNightSchedule = (schedule) => {
                if (!schedule) return;
                
                // 【修复】检测 schedule 格式
                // 完整格式: { dateStr: [{ staffId, shiftType, ... }] } - 数组
                // 旧格式: { staffId: { dateStr: 'NIGHT'/'rest' } } - 对象中嵌套对象，值为字符串
                const firstKey = Object.keys(schedule)[0];
                const firstValue = schedule[firstKey];
                const isDateFormat = Array.isArray(firstValue); // 只检测是否为数组
                
                console.log('[MonthlyScheduleConfigManager] applyNightSchedule 检测格式:', isDateFormat ? '日期格式' : '员工格式');
                console.log('[MonthlyScheduleConfigManager] 样本数据:', firstKey, firstValue);
                
                if (isDateFormat) {
                    // 格式1: { dateStr: [assignments] } - 完整格式
                    Object.keys(schedule).forEach(dateStr => {
                        const assignments = schedule[dateStr] || [];
                        if (Array.isArray(assignments)) {
                            assignments.forEach(assignment => {
                                if (assignment && assignment.staffId) {
                                    const shiftType = assignment.shiftType || 'night';
                                    const isPostShiftRest = assignment.isPostShiftRest || false;
                                    processAssignment(assignment.staffId, dateStr, shiftType, isPostShiftRest);
                                }
                            });
                        }
                    });
                } else {
                    // 格式2: { staffId: { dateStr: 'NIGHT'/'rest' } } - 旧格式
                    Object.keys(schedule).forEach(staffId => {
                        const staffSchedule = schedule[staffId];
                        if (staffSchedule && typeof staffSchedule === 'object') {
                            Object.keys(staffSchedule).forEach(dateStr => {
                                const shiftValue = staffSchedule[dateStr];
                                processAssignment(staffId, dateStr, shiftValue);
                            });
                        }
                    });
                }
                
                // 输出调试信息
                const totalStaff = Object.keys(nightShiftMap).length;
                const totalDates = Object.values(nightShiftMap).reduce((sum, d) => sum + Object.keys(d).length, 0);
                console.log('[MonthlyScheduleConfigManager] nightShiftMap 统计:', totalStaff, '人', totalDates, '条记录');
            };
            
            // 优先使用本配置“生成时快照”，保证展示/校验与求解口径一致
            const nightSnapshot = (config.dayShiftReport
                && config.dayShiftReport.meta
                && config.dayShiftReport.meta.nightShiftTypeMapSnapshot
                && typeof config.dayShiftReport.meta.nightShiftTypeMapSnapshot === 'object')
                ? config.dayShiftReport.meta.nightShiftTypeMapSnapshot
                : null;
            if (nightSnapshot && Object.keys(nightSnapshot).length > 0) {
                Object.keys(nightSnapshot).forEach((staffId) => {
                    nightShiftMap[staffId] = { ...(nightSnapshot[staffId] || {}) };
                });
                console.log('[MonthlyScheduleConfigManager] 使用 dayShiftReport 夜班快照渲染，员工数量:', Object.keys(nightShiftMap).length);
            } else {
                // 【修复】优先从 NightShiftManager.currentSchedule 读取完整格式（大夜 + 休整期）
                // 这个变量保存的是最新生成的完整数据
                if (typeof NightShiftManager !== 'undefined' && NightShiftManager.currentSchedule && Object.keys(NightShiftManager.currentSchedule).length > 0) {
                    console.log('[MonthlyScheduleConfigManager] 从 NightShiftManager.currentSchedule 读取排班数据（完整格式）');
                    applyNightSchedule(NightShiftManager.currentSchedule);
                }
                
                // 如果当前会话没有数据，从DB读取（包含完整格式）
                if (Object.keys(nightShiftMap).length === 0 && typeof DB !== 'undefined' && typeof DB.loadNightShiftSchedule === 'function') {
                    try {
                        const nightScheduleData = await DB.loadNightShiftSchedule('current');
                        if (nightScheduleData && nightScheduleData.schedule && Object.keys(nightScheduleData.schedule).length > 0) {
                            console.log('[MonthlyScheduleConfigManager] 从DB读取大夜排班数据（完整格式）');
                            applyNightSchedule(nightScheduleData.schedule);
                        }
                    } catch (error) {
                        console.warn('读取大夜排班失败:', error);
                    }
                }
                
                // 最后才尝试从激活的大夜配置读取（可能只包含大夜格式）
                if (Object.keys(nightShiftMap).length === 0) {
                    const activeNightShiftConfigId = Store.getState('activeNightShiftConfigId');
                    if (activeNightShiftConfigId) {
                        try {
                            const activeConfig = await DB.loadNightShiftConfigManagement(activeNightShiftConfigId);
                            if (activeConfig && activeConfig.schedule) {
                                console.log('[MonthlyScheduleConfigManager] 从激活的大夜配置读取排班数据');
                                applyNightSchedule(activeConfig.schedule);
                            }
                        } catch (error) {
                            console.warn('从激活的大夜配置读取失败:', error);
                        }
                    }
                }
            }
            const normalizedDisplayNightShiftMap = this.normalizeNightShiftTypeMapForStaff(allStaffData, nightShiftMap);
            console.log('[MonthlyScheduleConfigManager] 大夜排班数据已加载，员工数量:', Object.keys(normalizedDisplayNightShiftMap).length);

            // 【修复】优先从激活的个性化休假配置读取休假数据
            let personalRequestsData = Store.getAllPersonalRequests
                ? (Store.getAllPersonalRequests() || {})
                : {};
            const activeRequestConfigId = Store.getState('activeRequestConfigId');
            if (activeRequestConfigId && Store.getRequestConfig) {
                try {
                    const activeRequestConfig = Store.getRequestConfig(activeRequestConfigId);
                    if (activeRequestConfig && activeRequestConfig.personalRequestsSnapshot) {
                        console.log('[MonthlyScheduleConfigManager] 从激活的个性化休假配置读取数据');
                        personalRequestsData = activeRequestConfig.personalRequestsSnapshot;
                    }
                } catch (error) {
                    console.warn('从激活的个性化休假配置读取失败:', error);
                }
            }
            personalRequestsData = this.normalizePersonalRequestsForStaff(allStaffData, personalRequestsData || {});

            // 若本配置已跑过CSP，优先使用“求解后请求状态”渲染，避免置空后的休假仍锁定单元格
            const solvedRequestState = config.dayShiftReport
                && config.dayShiftReport.meta
                && config.dayShiftReport.meta.requestStateAfterSolve
                ? config.dayShiftReport.meta.requestStateAfterSolve
                : null;
            const effectiveRequestsForDisplay = this.normalizePersonalRequestsForStaff(
                allStaffData,
                solvedRequestState || personalRequestsData
            );

            // 计算每个人的应上班天数（总天数 - 法定节假日 - 年假）
            const targetDaysSnapshot = (config.dayShiftReport
                && config.dayShiftReport.stats
                && config.dayShiftReport.stats.targetDaysByStaff
                && typeof config.dayShiftReport.stats.targetDaysByStaff === 'object')
                ? config.dayShiftReport.stats.targetDaysByStaff
                : {};
            const expectedWorkDaysMap = {};
            allStaffData.forEach(staff => {
                const staffId = String(staff.staffId || staff.id || '').trim();
                if (!staffId) return;
                const solvedTarget = Number(targetDaysSnapshot[staffId]);
                if (Number.isFinite(solvedTarget)) {
                    expectedWorkDaysMap[staffId] = Math.max(0, Math.floor(solvedTarget));
                    return;
                }
                const directTarget = [
                    staff.targetDayShiftDays,
                    staff.expectedDayShiftDays,
                    staff.dayShiftTarget,
                    staff.dayShiftDays,
                    staff['应上白班天数']
                ].find((v) => Number.isFinite(Number(v)));
                if (Number.isFinite(Number(directTarget))) {
                    expectedWorkDaysMap[staffId] = Math.max(0, Math.floor(Number(directTarget)));
                    return;
                }
                // 展示口径统一按“当前大夜/休整/休假状态”实时推导，不直接吃人员主数据里的历史字段。
                const staffPersonalRequests = (effectiveRequestsForDisplay[staffId] || {});
                let annualLeaveCount = 0;
                dateList.forEach(dateInfo => {
                    const dateStr = dateInfo.dateStr;
                    if (staffPersonalRequests[dateStr] === 'ANNUAL' && !Store.isRestDay(dateStr)) {
                        annualLeaveCount += 1;
                    }
                });

                const totalDays = dateList.length;
                const expected = Math.max(0, totalDays - restDayCount - annualLeaveCount);
                // 只统计大夜天数，不包括休整期
                const nightCount = normalizedDisplayNightShiftMap[staffId]
                    ? Object.keys(normalizedDisplayNightShiftMap[staffId]).filter(dateStr => normalizedDisplayNightShiftMap[staffId][dateStr] === 'night').length
                    : 0;
                const expectedDayShift = Math.max(0, expected - nightCount);
                expectedWorkDaysMap[staffId] = expectedDayShift;
            });

            // 应用筛选
            const filterState = this.getMonthlyFilterState();
            let displayStaffData = allStaffData;
            if (typeof StaffFilter !== 'undefined' && StaffFilter.applyFilter) {
                displayStaffData = StaffFilter.applyFilter(allStaffData, filterState);
            }

            const validationTables = this.buildMonthlyValidationTables({
                dateList,
                allStaffData,
                staffScheduleData: config.staffScheduleData || {},
                scheduleResultSnapshot: config.scheduleResultSnapshot || {},
                expectedWorkDaysMap,
                nightShiftMap: normalizedDisplayNightShiftMap,
                personalRequests: effectiveRequestsForDisplay,
                dayShiftStats: (config.dayShiftReport && config.dayShiftReport.stats) ? config.dayShiftReport.stats : {},
                dayShiftMeta: (config.dayShiftReport && config.dayShiftReport.meta) ? config.dayShiftReport.meta : {},
                algorithmConfig: algoConfig
            });
            const hasGeneratedScheduleResult = !!(
                config.dayShiftReport
                && config.dayShiftReport.stats
                && typeof config.dayShiftReport.stats === 'object'
                && Object.keys(config.dayShiftReport.stats).length > 0
                && (
                    (config.scheduleResultSnapshot
                        && typeof config.scheduleResultSnapshot === 'object'
                        && Object.keys(config.scheduleResultSnapshot).length > 0)
                    || Object.values(config.staffScheduleData || {}).some((row) => {
                        const daily = (row && row.dailySchedule && typeof row.dailySchedule === 'object')
                            ? row.dailySchedule
                            : {};
                        return Object.keys(daily).length > 0;
                    })
                )
            );

            // 渲染HTML
            if (typeof MonthlyScheduleTableRenderer !== 'undefined' && MonthlyScheduleTableRenderer.renderHTML) {
                const generationJob = this.getGenerationJob(config.configId);
                const renderedHtml = MonthlyScheduleTableRenderer.renderHTML({
                    dateList,
                    displayStaffData,
                    allStaffData,
                    filterState,
                    currentConfigName: this.currentConfigName,
                    expectedWorkDaysMap,
                    shiftTypes: this.SHIFT_TYPES,
                    configId: config.configId,
                    staffScheduleData: config.staffScheduleData,
                    nightShiftMap: normalizedDisplayNightShiftMap,
                    personalRequests: effectiveRequestsForDisplay,
                    restDaysMap,
                    specialFlags,
                    connectedToSpecial,
                    validationTables,
                    generationJob,
                    hasGeneratedScheduleResult,
                    analysisConfig: {
                        maxExtraDayPerStaff: Number.isFinite(Number(algoConfig.whiteShiftOverageLimit))
                            ? Math.max(0, Math.floor(Number(algoConfig.whiteShiftOverageLimit)))
                            : (
                                Number.isFinite(Number(algoConfig.maxExtraDayPerStaff))
                                    ? Math.max(0, Math.floor(Number(algoConfig.maxExtraDayPerStaff)))
                                    : 0
                            ),
                        maxConsecutiveWorkDays: Number.isFinite(Number(algoConfig.maxConsecutiveWorkDays))
                            ? Math.max(0, Math.floor(Number(algoConfig.maxConsecutiveWorkDays)))
                            : 0,
                        minConsecutiveRestDays: Number.isFinite(Number(algoConfig.minConsecutiveRestDays))
                            ? Math.max(0, Math.floor(Number(algoConfig.minConsecutiveRestDays)))
                            : 0
                    }
                });
                if (!setScheduleTableHtml(renderedHtml)) {
                    return;
                }
                this.syncGenerationProgressDom(config.configId);
            } else {
                setScheduleTableHtml(`
                    <div class="p-8 text-center text-gray-400">
                        <p>月度班次渲染器未加载，请刷新页面重试</p>
                    </div>
                `);
            }
        } catch (error) {
            console.error('updateMonthlyScheduleDisplay 失败:', error);
            alert('渲染月度班次配置失败：' + error.message);
        } finally {
            _isUpdatingMonthlyScheduleDisplay = false;
        }
    },

    buildMonthlyValidationTables(ctx) {
        const {
            dateList = [],
            allStaffData = [],
            staffScheduleData = {},
            scheduleResultSnapshot = {},
            expectedWorkDaysMap = {},
            nightShiftMap = {},
            personalRequests = {},
            dayShiftStats = {},
            dayShiftMeta = {},
            algorithmConfig = {}
        } = ctx || {};

        const getStaffId = (staff) => String(staff.staffId || staff.id || '').trim();
        const staffIds = allStaffData.map(getStaffId).filter(Boolean);

        const dailyDemand = (Store.getState('minimumManpowerConfig') || {}).dailyDemand || {};
        const shiftTypes = this.SHIFT_TYPES.slice();
        const skillTypes = this.SKILL_TYPES.slice();
        const skillTolerance = 1;
        const hasSnapshot = scheduleResultSnapshot && typeof scheduleResultSnapshot === 'object' && Object.keys(scheduleResultSnapshot).length > 0;

        const skillRatio = this.buildSkillExpectedRatio(dayShiftStats, algorithmConfig, skillTypes);
        const personalVacationTypes = new Set(['ANNUAL', 'LEGAL', 'REQ', 'SICK']);
        const dailyShiftRows = [];
        const dailySkillRows = [];
        const snapshotDailyShiftCount = {};
        const snapshotDayShiftSetByStaff = {};
        const blockedShiftConflictsByDate = {};

        dateList.forEach((dateInfo) => {
            const dateStr = dateInfo.dateStr;
            snapshotDailyShiftCount[dateStr] = {};
            blockedShiftConflictsByDate[dateStr] = 0;
            shiftTypes.forEach((s) => {
                snapshotDailyShiftCount[dateStr][s] = 0;
            });
        });

        if (hasSnapshot) {
            Object.keys(scheduleResultSnapshot || {}).forEach((staffId) => {
                const row = scheduleResultSnapshot[staffId] || {};
                const daySet = new Set();
                Object.entries(row).forEach(([dateStr, shift]) => {
                    if (!shiftTypes.includes(shift)) return;
                    const nightType = (nightShiftMap[String(staffId)] || {})[dateStr];
                    const reqType = (personalRequests[String(staffId)] || {})[dateStr];
                    const isBlocked = nightType === 'night' || nightType === 'rest' || personalVacationTypes.has(reqType);
                    if (isBlocked) {
                        if (blockedShiftConflictsByDate[dateStr] != null) {
                            blockedShiftConflictsByDate[dateStr] += 1;
                        }
                        return;
                    }
                    if (snapshotDailyShiftCount[dateStr] && snapshotDailyShiftCount[dateStr][shift] != null) {
                        snapshotDailyShiftCount[dateStr][shift] += 1;
                    }
                    daySet.add(dateStr);
                });
                snapshotDayShiftSetByStaff[String(staffId)] = daySet;
            });
        }

        dateList.forEach((dateInfo) => {
            const dateStr = dateInfo.dateStr;
            const shiftExpectedRow = dailyDemand[dateStr] || {};
            const shiftActual = {};
            const shiftExpected = {};
            const shiftGap = {};

            shiftTypes.forEach((shift) => {
                shiftActual[shift] = 0;
                shiftExpected[shift] = Number.isFinite(Number(shiftExpectedRow[shift])) ? Math.max(0, Math.floor(Number(shiftExpectedRow[shift]))) : 0;
            });

            const skillActual = {};
            skillTypes.forEach((skill) => {
                skillActual[skill] = 0;
            });

            if (hasSnapshot) {
                shiftTypes.forEach((shift) => {
                    shiftActual[shift] = Number(snapshotDailyShiftCount[dateStr]?.[shift] || 0);
                });
            } else {
                staffIds.forEach((staffId) => {
                    const row = staffScheduleData[staffId] || {};
                    const shiftType = row.shiftType || '';
                    const daily = row.dailySchedule || {};
                    const skill = daily[dateStr];
                    if (!skill) return;

                    if (shiftTypes.includes(shiftType)) {
                        shiftActual[shiftType] += 1;
                    }
                });
            }

            staffIds.forEach((staffId) => {
                const row = staffScheduleData[staffId] || {};
                const daily = row.dailySchedule || {};
                const skill = daily[dateStr];
                if (!skill) return;
                if (Object.prototype.hasOwnProperty.call(skillActual, skill)) {
                    skillActual[skill] += 1;
                }
            });

            const blockedConflicts = Number(blockedShiftConflictsByDate[dateStr] || 0);
            const shiftPassAll = shiftTypes.every((shift) => {
                const gap = shiftActual[shift] - shiftExpected[shift];
                shiftGap[shift] = gap;
                return gap >= 0;
            }) && blockedConflicts === 0;

            const daySkillTotal = skillTypes.reduce((sum, skill) => sum + (skillActual[skill] || 0), 0);
            const skillExpected = this.distributeSkillExpectedByRatio(daySkillTotal, skillRatio, skillTypes);
            const skillGap = {};
            const skillPassAll = skillTypes.every((skill) => {
                const gap = (skillActual[skill] || 0) - (skillExpected[skill] || 0);
                skillGap[skill] = gap;
                return Math.abs(gap) <= skillTolerance;
            });

            dailyShiftRows.push({
                dateStr,
                weekday: dateInfo.weekday,
                actual: shiftActual,
                expected: shiftExpected,
                gap: shiftGap,
                blockedConflicts,
                isPass: shiftPassAll
            });

            dailySkillRows.push({
                dateStr,
                weekday: dateInfo.weekday,
                actual: skillActual,
                expected: skillExpected,
                gap: skillGap,
                tolerance: skillTolerance,
                isPass: skillPassAll
            });
        });

        const staffMonthlyRows = allStaffData.map((staff) => {
            const staffId = getStaffId(staff);
            const staffName = staff.staffName || staff.name || '';
            const row = staffScheduleData[staffId] || {};
            const daily = row.dailySchedule || {};
            const reqMap = personalRequests[staffId] || {};
            const nightRow = nightShiftMap[staffId] || {};

            const dayShiftSet = hasSnapshot
                ? new Set(Array.from(snapshotDayShiftSetByStaff[staffId] || []))
                : new Set();
            const nightSet = new Set();
            const personalVacationSet = new Set();
            const workTypeByDate = {};

            dateList.forEach((dateInfo) => {
                const dateStr = dateInfo.dateStr;
                const isDayShift = hasSnapshot ? dayShiftSet.has(dateStr) : !!daily[dateStr];
                const isNight = nightRow[dateStr] === 'night';
                const reqType = reqMap[dateStr];
                const isPersonalVacation = personalVacationTypes.has(reqType);

                if (!hasSnapshot && isDayShift) dayShiftSet.add(dateStr);
                if (isNight) nightSet.add(dateStr);
                if (isPersonalVacation) personalVacationSet.add(dateStr);

                workTypeByDate[dateStr] = (isDayShift || isNight) ? 'W' : 'R';
            });

            const runStats = this.computeContinuousRunStats(dateList, workTypeByDate);
            const workDayCount = new Set([...dayShiftSet, ...nightSet]).size;
            const personalVacationCount = Array.from(personalVacationSet).filter((d) => !dayShiftSet.has(d) && !nightSet.has(d)).length;
            const generalRestCount = Math.max(0, dateList.length - workDayCount - personalVacationCount);
            const expectedDayShiftDays = Number.isFinite(Number(expectedWorkDaysMap[staffId])) ? Number(expectedWorkDaysMap[staffId]) : 0;
            const expectedRestDays = Math.max(0, dateList.length - nightSet.size - expectedDayShiftDays);
            const actualRestDays = Math.max(0, personalVacationCount + generalRestCount);
            const actualDayShiftDays = dayShiftSet.size;

            return {
                staffId,
                staffName,
                totalDays: dateList.length,
                nightDays: nightSet.size,
                personalVacationDays: personalVacationCount,
                generalRestDays: generalRestCount,
                expectedRestDays,
                actualRestDays,
                expectedDayShiftDays,
                actualDayShiftDays,
                longestRest: runStats.rest.max,
                longestWork: runStats.work.max,
                shortestRest: runStats.rest.min,
                shortestWork: runStats.work.min
            };
        });

        const solverMeta = (dayShiftMeta && dayShiftMeta.solver && typeof dayShiftMeta.solver === 'object')
            ? dayShiftMeta.solver
            : {};
        const minimumMeta = (dayShiftMeta && dayShiftMeta.minimumManpower && typeof dayShiftMeta.minimumManpower === 'object')
            ? dayShiftMeta.minimumManpower
            : {};
        const shiftRebalanceMeta = (minimumMeta && minimumMeta.shiftShortageRebalance && typeof minimumMeta.shiftShortageRebalance === 'object')
            ? minimumMeta.shiftShortageRebalance
            : {};
        const attemptLogs = Array.isArray(shiftRebalanceMeta.attemptLogs) ? shiftRebalanceMeta.attemptLogs : [];
        const selectedProfileId = String(shiftRebalanceMeta.profileId || '');
        const selectedProfileName = String(shiftRebalanceMeta.profileName || '');
        const solverProgressRows = attemptLogs.map((item, idx) => {
            const before = (item && item.beforeHard && typeof item.beforeHard === 'object') ? item.beforeHard : {};
            const after = (item && item.afterHard && typeof item.afterHard === 'object')
                ? item.afterHard
                : ((item && item.hard && typeof item.hard === 'object') ? item.hard : {});
            const beforeShortage = Number(before.dailyShortage || 0);
            const afterShortage = Number(after.dailyShortage || 0);
            const beforeTotal = Number(before.total || 0);
            const afterTotal = Number(after.total || 0);
            const beforeTargetMismatch = Number(before.targetMismatch || 0);
            const afterTargetMismatch = Number(after.targetMismatch || 0);
            const roundLogs = Array.isArray(item && item.roundLogs) ? item.roundLogs : [];
            const monthlyReassign = (item && item.monthlyReassign && typeof item.monthlyReassign === 'object')
                ? item.monthlyReassign
                : null;
            const rollbackRounds = roundLogs.filter((r) => r && r.rolledBack === true).length;
            const improved = (afterShortage < beforeShortage)
                || (afterShortage === beforeShortage && afterTotal < beforeTotal)
                || (afterShortage === beforeShortage && afterTotal === beforeTotal && afterTargetMismatch < beforeTargetMismatch);

            return {
                index: idx + 1,
                profileId: String(item.profileId || ''),
                profileName: String(item.profileName || ''),
                beforeShortage,
                afterShortage,
                beforeTotal,
                afterTotal,
                beforeTargetMismatch,
                afterTargetMismatch,
                movedCount: Number(item.movedCount || 0),
                monthlyReassignCount: monthlyReassign ? Number(monthlyReassign.forcedCount || 0) : 0,
                monthlyReassignSkipped: monthlyReassign ? (monthlyReassign.skipped === true) : false,
                monthlyReassignReason: monthlyReassign ? String(monthlyReassign.reason || '') : '',
                rounds: Number(item.rounds || 0),
                rollbackRounds,
                isImproved: improved,
                isSelected: selectedProfileId !== '' && String(item.profileId || '') === selectedProfileId
            };
        });

        const hard = (dayShiftStats && dayShiftStats.hardViolations && typeof dayShiftStats.hardViolations === 'object')
            ? dayShiftStats.hardViolations
            : {};
        const solverProgressMeta = {
            requestedMode: String(solverMeta.requestedMode || '').toUpperCase(),
            usedMode: String(solverMeta.usedMode || '').toUpperCase(),
            strictMIP: solverMeta.strictMIP === true,
            selectedProfileId,
            selectedProfileName,
            finalDailyShortage: Number(hard.dailyShortage || 0),
            finalHardTotal: Number(hard.total || 0),
            finalTargetMismatch: Number(hard.targetMismatch || 0)
        };

        return {
            skillTolerance,
            dailyShiftRows,
            dailySkillRows,
            staffMonthlyRows,
            solverProgressRows,
            solverProgressMeta
        };
    },

    buildSkillExpectedRatio(dayShiftStats, algorithmConfig, skillTypes) {
        const ratio = {};
        let total = 0;
        const fromFunctionTargets = (dayShiftStats && dayShiftStats.functionTargets && typeof dayShiftStats.functionTargets === 'object')
            ? dayShiftStats.functionTargets
            : null;

        skillTypes.forEach((skill) => {
            const v = fromFunctionTargets ? Number(fromFunctionTargets[skill]) : NaN;
            if (Number.isFinite(v) && v > 0) {
                ratio[skill] = v;
                total += v;
            }
        });
        if (total > 0) {
            skillTypes.forEach((skill) => {
                ratio[skill] = (ratio[skill] || 0) / total;
            });
            return ratio;
        }

        const minimumManpowerConfig = (typeof Store !== 'undefined')
            ? (Store.getState('minimumManpowerConfig') || {})
            : {};
        const baseline = (algorithmConfig && algorithmConfig.globalDailyFunctionBaseline && typeof algorithmConfig.globalDailyFunctionBaseline === 'object')
            ? algorithmConfig.globalDailyFunctionBaseline
            : (minimumManpowerConfig && minimumManpowerConfig.shanghaiFunctionBaseline && typeof minimumManpowerConfig.shanghaiFunctionBaseline === 'object')
                ? minimumManpowerConfig.shanghaiFunctionBaseline
                : {
                    '网': 9,
                    '天': 3,
                    '微': 5,
                    '追': 2,
                    '收': 1,
                    '综': 1,
                    '银B': 3,
                    '毛': 2,
                    '星': 4
                };

        skillTypes.forEach((skill) => {
            const v = Number(baseline[skill]);
            if (Number.isFinite(v) && v > 0) {
                ratio[skill] = v;
                total += v;
            }
        });

        if (total <= 0) {
            const even = 1 / Math.max(1, skillTypes.length);
            skillTypes.forEach((skill) => { ratio[skill] = even; });
            return ratio;
        }

        skillTypes.forEach((skill) => {
            ratio[skill] = (ratio[skill] || 0) / total;
        });
        return ratio;
    },

    distributeSkillExpectedByRatio(total, ratio, skillTypes) {
        const expected = {};
        const remainders = [];
        let assigned = 0;
        const safeTotal = Math.max(0, Math.floor(Number(total) || 0));

        skillTypes.forEach((skill) => {
            const r = Number(ratio[skill]);
            const safeRatio = Number.isFinite(r) && r >= 0 ? r : 0;
            const raw = safeTotal * safeRatio;
            const base = Math.floor(raw);
            expected[skill] = base;
            assigned += base;
            remainders.push({ skill, frac: raw - base });
        });

        remainders.sort((a, b) => b.frac - a.frac);
        let left = safeTotal - assigned;
        let idx = 0;
        while (left > 0 && remainders.length > 0) {
            const skill = remainders[idx % remainders.length].skill;
            expected[skill] += 1;
            left -= 1;
            idx += 1;
        }

        return expected;
    },

    computeContinuousRunStats(dateList, workTypeByDate) {
        const runs = { W: [], R: [] };
        let curr = null;
        let len = 0;

        dateList.forEach((d, idx) => {
            const t = workTypeByDate[d.dateStr] === 'W' ? 'W' : 'R';
            if (idx === 0) {
                curr = t;
                len = 1;
                return;
            }
            if (t === curr) {
                len += 1;
                return;
            }
            runs[curr].push(len);
            curr = t;
            len = 1;
        });
        if (len > 0 && curr) {
            runs[curr].push(len);
        }

        const toStats = (arr) => {
            if (!arr || arr.length === 0) {
                return { max: 0, min: 0 };
            }
            return {
                max: Math.max(...arr),
                min: Math.min(...arr)
            };
        };

        return {
            work: toStats(runs.W),
            rest: toStats(runs.R)
        };
    },

    /**
     * 配置参数（算法参数 + 技能列表）
     */
    async showConfigParamsListDialog(current) {
        return new Promise((resolve) => {
            const esc = (v) => String(v == null ? '' : v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

            const intFields = [
                { key: 'maxIterations', label: '最大迭代次数 maxIterations', min: 10 },
                { key: 'backtrackLimit', label: '回溯限制 backtrackLimit', min: 1 },
                { key: 'whiteShiftOverageLimit', label: '白班超额上限 whiteShiftOverageLimit', min: 0 },
                { key: 'maxEmergencyExtraDayPerStaff', label: '应急超上限附加天数 maxEmergencyExtraDayPerStaff', min: 0 },
                { key: 'hardShortageRescueRounds', label: '硬约束兜底补缺轮数 hardShortageRescueRounds', min: 0 },
                { key: 'extraByTargetAvgScoreWeight', label: '目标均值偏置权重 extraByTargetAvgScoreWeight', min: 0 },
                { key: 'extraOverTargetLevelPenaltyWeight', label: '超目标层级惩罚 extraOverTargetLevelPenaltyWeight', min: 0 },
                { key: 'extraCapHighTargetReduceStepDays', label: '高目标cap收紧步长(日) extraCapHighTargetReduceStepDays', min: 1 },
                { key: 'extraCapHighTargetReducePerStep', label: '高目标cap每步收紧 extraCapHighTargetReducePerStep', min: 0 },
                { key: 'functionBalanceM', label: '职能均衡阈值 m（max-min<=m）', min: 0 },
                { key: 'shiftBalanceSixTotalTolerance', label: '同班别六类总量容忍值 shiftBalanceSixTotalTolerance', min: 0 },
                { key: 'preferredMinWorkDays', label: '连续上班偏好下限 preferredMinWorkDays', min: 1 },
                { key: 'preferredMinRestDays', label: '连续休假偏好下限 preferredMinRestDays', min: 1 },
                { key: 'preferredLongestRestDays', label: '最长连续休假偏好值 preferredLongestRestDays（软约束）', min: 1 },
                { key: 'minConsecutiveWorkDays', label: '最小连续上班天数 minConsecutiveWorkDays', min: 1 },
                { key: 'maxConsecutiveWorkDays', label: '最大连续上班天数 maxConsecutiveWorkDays', min: 1 },
                { key: 'minConsecutiveRestDays', label: '最小连续休假天数 minConsecutiveRestDays', min: 1 },
                { key: 'maxConsecutiveRestDays', label: '最大连续休假天数 maxConsecutiveRestDays', min: 1 },
                { key: 'maxVacationClearSteps', label: '特殊休假最大置空步数 maxVacationClearSteps', min: 0 }
            ];

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.45);
                z-index: 12000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const rowsHtml = intFields.map((field) => `
                <tr>
                    <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; white-space: nowrap;">
                        ${esc(field.label)}
                    </td>
                    <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
                        <input id="msc_param_${esc(field.key)}" type="number" min="${field.min}" step="1"
                               value="${esc(current[field.key])}"
                               style="width: 180px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
                    </td>
                </tr>
            `).join('');

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: #fff;
                border-radius: 10px;
                width: min(920px, 94vw);
                max-height: 88vh;
                box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
                display: flex;
                flex-direction: column;
            `;
            dialog.innerHTML = `
                <div style="padding: 16px 18px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-size: 17px; font-weight: 700; color: #111827;">月度排班参数配置</div>
                    <div style="margin-top: 4px; font-size: 12px; color: #6b7280;">
                        列表编辑，保存后一次生效。最长连续休假偏好为软约束，仅在满足每日最低人力后尽量满足。
                    </div>
                    <div id="msc_param_error" style="display:none; margin-top: 8px; color:#b91c1c; font-size: 12px;"></div>
                </div>
                <div style="padding: 14px 18px; overflow: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tbody>
                            <tr>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; white-space: nowrap;">
                                    算法模式 algorithmMode
                                </td>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
                                    <select id="msc_param_algorithmMode"
                                            style="width: 180px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
                                        <option value="hybrid">hybrid</option>
                                        <option value="mip">mip</option>
                                        <option value="csp">csp</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; white-space: nowrap;">
                                    城市拆分策略 citySplitStrategy
                                </td>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
                                    <select id="msc_param_citySplitStrategy"
                                            style="width: 240px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
                                        <option value="home_city">home_city（按员工归属地）</option>
                                        <option value="city_shift_split">city_shift_split（按城市班别拆分）</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; white-space: nowrap;">
                                    网/天/微均衡开关 netTianWeiBalanceEnabled
                                </td>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
                                    <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #111827;">
                                        <input id="msc_param_netTianWeiBalanceEnabled" type="checkbox">
                                        开启（关闭时仅做其余六类职能均衡）
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; white-space: nowrap;">
                                    连续休假软目标开关 continuousRestSoftGoalEnabled
                                </td>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
                                    <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #111827;">
                                        <input id="msc_param_continuousRestSoftGoalEnabled" type="checkbox">
                                        开启（关闭时不做最长连续休假偏好优化）
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; white-space: nowrap;">
                                    额外加班按目标均值偏置 extraByTargetAvgBiasEnabled
                                </td>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
                                    <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #111827;">
                                        <input id="msc_param_extraByTargetAvgBiasEnabled" type="checkbox">
                                        开启（高目标少加班，低目标优先补位）
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; white-space: nowrap;">
                                    可选职能 skillTypes（逗号分隔）
                                </td>
                                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
                                    <input id="msc_param_skillTypes" type="text"
                                           value="${esc((current.skillTypes || []).join(','))}"
                                           style="width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
                                </td>
                            </tr>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                <div style="padding: 12px 18px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="msc_param_cancel"
                            style="padding: 8px 16px; border: none; background: #6b7280; color: #fff; border-radius: 6px; cursor: pointer;">
                        取消
                    </button>
                    <button id="msc_param_save"
                            style="padding: 8px 16px; border: none; background: #2563eb; color: #fff; border-radius: 6px; cursor: pointer;">
                        保存
                    </button>
                </div>
            `;
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const modeSelect = dialog.querySelector('#msc_param_algorithmMode');
            const citySplitStrategySelect = dialog.querySelector('#msc_param_citySplitStrategy');
            const netTianWeiCheckbox = dialog.querySelector('#msc_param_netTianWeiBalanceEnabled');
            const continuousRestSoftGoalCheckbox = dialog.querySelector('#msc_param_continuousRestSoftGoalEnabled');
            const extraBiasCheckbox = dialog.querySelector('#msc_param_extraByTargetAvgBiasEnabled');
            const errorNode = dialog.querySelector('#msc_param_error');
            const skillInput = dialog.querySelector('#msc_param_skillTypes');
            modeSelect.value = String(current.algorithmMode || 'hybrid').toLowerCase();
            citySplitStrategySelect.value = String(current.citySplitStrategy || 'home_city').toLowerCase() === 'city_shift_split'
                ? 'city_shift_split'
                : 'home_city';
            netTianWeiCheckbox.checked = current.netTianWeiBalanceEnabled !== false;
            continuousRestSoftGoalCheckbox.checked = current.continuousRestSoftGoalEnabled !== false;
            extraBiasCheckbox.checked = current.extraByTargetAvgBiasEnabled !== false;

            const setError = (msg) => {
                errorNode.textContent = msg || '';
                errorNode.style.display = msg ? 'block' : 'none';
            };
            const closeDialog = (value) => {
                window.removeEventListener('keydown', handleKeydown);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve(value);
            };
            const validateAndBuild = () => {
                const mode = String(modeSelect.value || '').trim().toLowerCase();
                if (!['hybrid', 'mip', 'csp'].includes(mode)) {
                    setError('算法模式仅支持 hybrid / mip / csp');
                    return null;
                }
                const citySplitStrategy = String(citySplitStrategySelect.value || '').trim().toLowerCase();
                if (!['home_city', 'city_shift_split'].includes(citySplitStrategy)) {
                    setError('城市拆分策略仅支持 home_city / city_shift_split');
                    return null;
                }

                const skillTypes = String(skillInput.value || '')
                    .split(',')
                    .map((s) => String(s || '').trim())
                    .filter(Boolean);
                if (skillTypes.length <= 0) {
                    setError('职能列表不能为空');
                    return null;
                }

                const next = {
                    ...current,
                    algorithmMode: mode,
                    citySplitStrategy,
                    skillTypes,
                    netTianWeiBalanceEnabled: netTianWeiCheckbox.checked,
                    majorFunctionPersonalRatioEnabled: netTianWeiCheckbox.checked,
                    continuousRestSoftGoalEnabled: continuousRestSoftGoalCheckbox.checked,
                    extraByTargetAvgBiasEnabled: extraBiasCheckbox.checked
                };

                for (let i = 0; i < intFields.length; i++) {
                    const field = intFields[i];
                    const input = dialog.querySelector(`#msc_param_${field.key}`);
                    const raw = input ? String(input.value || '').trim() : '';
                    const num = Number(raw);
                    if (!Number.isFinite(num)) {
                        setError(`${field.label} 必须为数字`);
                        return null;
                    }
                    const val = Math.max(field.min, Math.floor(num));
                    next[field.key] = val;
                }

                if (next.maxConsecutiveWorkDays < next.minConsecutiveWorkDays) {
                    next.maxConsecutiveWorkDays = next.minConsecutiveWorkDays;
                }
                if (next.maxConsecutiveRestDays < next.minConsecutiveRestDays) {
                    next.maxConsecutiveRestDays = next.minConsecutiveRestDays;
                }
                // 新旧字段兼容：统一以 whiteShiftOverageLimit 为准
                next.maxExtraDayPerStaff = next.whiteShiftOverageLimit;

                setError('');
                return next;
            };

            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeDialog(null);
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    const built = validateAndBuild();
                    if (built) closeDialog(built);
                }
            };
            window.addEventListener('keydown', handleKeydown);

            dialog.querySelector('#msc_param_cancel').addEventListener('click', () => closeDialog(null));
            dialog.querySelector('#msc_param_save').addEventListener('click', () => {
                const built = validateAndBuild();
                if (built) closeDialog(built);
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeDialog(null);
            });
        });
    },

    async openConfigParams() {
        const config = this.getCurrentConfig();
        if (!config) {
            alert('未找到配置');
            return;
        }

        const current = this.getEffectiveAlgorithmConfig(config);

        try {
            const nextConfig = await this.showConfigParamsListDialog(current);
            if (!nextConfig) return;

            config.algorithmConfig = nextConfig;
            this.SKILL_TYPES = nextConfig.skillTypes.slice();
            config.updatedAt = new Date().toISOString();
            await DB.saveMonthlyScheduleConfig(config);
            await Store.saveState();
            this.updateMonthlyScheduleDisplay();
            updateStatus('月度排班参数已更新', 'success');
        } catch (error) {
            console.error('配置参数失败:', error);
            alert('配置参数失败：' + error.message);
        }
    },

    /**
     * 清空所有技能与班别
     */
    async clearAllSkillsAndShifts() {
        const config = this.getCurrentConfig();
        if (!config) {
            alert('未找到配置');
            return;
        }

        Object.values(config.staffScheduleData || {}).forEach(staffData => {
            staffData.shiftType = '';
            staffData.dailySchedule = {};
        });

        config.scheduleResultSnapshot = null;
        config.updatedAt = new Date().toISOString();

        try {
            await DB.saveMonthlyScheduleConfig(config);
            await Store.saveState();
            this.updateMonthlyScheduleDisplay();
            updateStatus('已清空所有技能与班别', 'success');
        } catch (error) {
            console.error('清空技能与班别失败:', error);
            alert('清空失败：' + error.message);
        }
    },

    /**
     * 生成月度班次配置（使用 CSP 白班算法）
     */
    async generateMonthlyScheduleConfig(options = {}) {
        const runInBackground = options && options.__backgroundTask === true;
        const explicitConfigId = String((options && options.configId) || '').trim();
        const config = explicitConfigId
            ? ((Store.getMonthlyScheduleConfigs ? Store.getMonthlyScheduleConfigs() : []).find((c) => String(c.configId || '') === explicitConfigId) || null)
            : this.getCurrentConfig();
        if (!config) {
            alert('未找到配置');
            return;
        }
        const configId = String(config.configId || this.currentConfigId || '').trim();
        if (!configId) {
            alert('配置ID无效');
            return;
        }

        if (!runInBackground) {
            const runningJob = this.getRunningGenerationJob();
            if (runningJob && String(runningJob.configId || '') !== configId) {
                alert(`已有其他月度配置正在后台生成（${runningJob.configName || runningJob.configId}），请稍后再试`);
                return;
            }
            if (runningJob && String(runningJob.configId || '') === configId) {
                updateStatus('当前配置已在后台生成中，可返回列表稍后查看进度', 'info');
                this.syncGenerationProgressDom(configId);
                return await this.waitForGenerationJobCompletion(configId);
            }
        }

        const scheduleConfig = Store.getState('scheduleConfig');
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            alert('请先配置排班周期');
            return;
        }

        if (typeof CSPSolver === 'undefined') {
            alert('白班排班算法模块未加载');
            return;
        }

        if (!runInBackground) {
            await this.updateGenerationJob(configId, {
                jobId: `monthly_gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                configId,
                configName: String(config.name || ''),
                status: 'running',
                progress: 1,
                stageKey: 'queued',
                message: '任务已创建，等待后台执行...'
            }, { persistNow: true });
            updateStatus('月度班次配置已进入后台生成，可返回列表继续其他操作', 'info');
            this.syncGenerationProgressDom(configId);
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.generateMonthlyScheduleConfig({
                        __backgroundTask: true,
                        configId
                    }).then(resolve).catch((error) => {
                        console.error('[MonthlyScheduleConfigManager] 后台月度排班任务异常:', error);
                        reject(error);
                    });
                }, 0);
            });
        }

        await this.updateGenerationJob(configId, {
            status: 'running',
            progress: 2,
            stageKey: 'init',
            message: '正在准备输入数据...'
        }, { persistNow: false });
        this.syncGenerationProgressDom(configId);

        try {
            const staffData = Store.getCurrentStaffData() || [];
            if (staffData.length === 0) {
                throw new Error('请先加载人员数据');
            }

            if (!config.staffScheduleData) {
                config.staffScheduleData = {};
            }
            await this.updateGenerationJob(configId, {
                progress: 8,
                stageKey: 'preprocess',
                message: `已加载 ${staffData.length} 名人员，正在解析算法参数...`
            });
            await this.yieldToUi();

            const algoConfig = this.getEffectiveAlgorithmConfig(config);
            config.algorithmConfig = algoConfig;
            this.SKILL_TYPES = algoConfig.skillTypes.slice();

            // 1) 读取个性化休假（优先激活配置）
            let personalRequestsData = Store.getAllPersonalRequests
                ? (Store.getAllPersonalRequests() || {})
                : {};
            const activeRequestConfigId = Store.getState('activeRequestConfigId');
            if (activeRequestConfigId && Store.getRequestConfig) {
                const activeRequestConfig = Store.getRequestConfig(activeRequestConfigId);
                if (activeRequestConfig && activeRequestConfig.personalRequestsSnapshot) {
                    personalRequestsData = activeRequestConfig.personalRequestsSnapshot;
                }
            }
            const normalizedPersonalRequests = this.normalizePersonalRequestsForStaff(staffData, personalRequestsData || {});
            const mergedRequests = JSON.parse(JSON.stringify(normalizedPersonalRequests || {}));

            // 2) 读取大夜结果：night 走 nightSchedule；rest 走 personalRequests(REST)
            const rawNightShiftTypeMap = await this.getNightShiftMap();
            const nightShiftTypeMap = this.normalizeNightShiftTypeMapForStaff(staffData, rawNightShiftTypeMap || {});
            const nightSchedule = {};
            Object.entries(nightShiftTypeMap || {}).forEach(([staffId, dayMap]) => {
                Object.entries(dayMap || {}).forEach(([dateStr, type]) => {
                    if (type === 'night') {
                        if (!nightSchedule[staffId]) nightSchedule[staffId] = {};
                        nightSchedule[staffId][dateStr] = 'NIGHT';
                        return;
                    }
                    if (type === 'rest') {
                        if (!nightSchedule[staffId]) nightSchedule[staffId] = {};
                        // 将休整期也显式传入求解器，确保无论休假是否被清空都不可排白班
                        nightSchedule[staffId][dateStr] = 'REST';
                        if (!mergedRequests[staffId]) mergedRequests[staffId] = {};
                        if (!mergedRequests[staffId][dateStr]) {
                            mergedRequests[staffId][dateStr] = 'REST';
                        }
                    }
                });
            });
            const dateListForSolve = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
            const minimumDailyDemand = this.getDailyMinimumDemandForDates(dateListForSolve);
            const specialRestRebalance = this.rebalanceSpecialRestRequestsForCoverage({
                staffData,
                dateList: dateListForSolve,
                requests: mergedRequests,
                nightShiftTypeMap,
                dailyDemand: minimumDailyDemand
            });
            const requestsForSolve = (specialRestRebalance && specialRestRebalance.adjustedRequests)
                ? specialRestRebalance.adjustedRequests
                : mergedRequests;
            await this.updateGenerationJob(configId, {
                progress: 16,
                stageKey: 'preprocess',
                message: '约束预处理完成，正在构建求解规则...'
            });
            await this.yieldToUi();

            // 3) 调用 CSP 白班排班
            const dayShiftRules = typeof DayShiftRules !== 'undefined' ? DayShiftRules.getRules() : {};
            const l0 = {
                name: 'L0',
                minWork: algoConfig.minConsecutiveWorkDays,
                maxWork: algoConfig.maxConsecutiveWorkDays,
                minRest: algoConfig.minConsecutiveRestDays,
                maxRest: algoConfig.maxConsecutiveRestDays
            };
            const l1 = {
                name: 'L1',
                minWork: Math.max(1, l0.minWork - 1),
                maxWork: l0.maxWork + 1,
                minRest: Math.max(1, l0.minRest - 1),
                maxRest: l0.maxRest
            };
            const l2 = {
                name: 'L2',
                minWork: l1.minWork,
                maxWork: l1.maxWork,
                minRest: l1.minRest,
                maxRest: l1.maxRest + 1
            };
            const l3 = {
                name: 'L3',
                minWork: l1.minWork,
                maxWork: l1.maxWork + 1,
                minRest: l1.minRest,
                maxRest: l1.maxRest + 1
            };
            const whiteShiftOverageLimit = Number.isFinite(Number(algoConfig.whiteShiftOverageLimit))
                ? Math.max(0, Math.floor(Number(algoConfig.whiteShiftOverageLimit)))
                : Math.max(0, Math.floor(Number(algoConfig.maxExtraDayPerStaff || 0)));
            const mergedRules = {
                ...dayShiftRules,
                citySplitStrategy: String(algoConfig.citySplitStrategy || 'home_city').toLowerCase() === 'city_shift_split'
                    ? 'city_shift_split'
                    : 'home_city',
                functionBalanceM: algoConfig.functionBalanceM,
                shiftBalanceSixTotalTolerance: algoConfig.shiftBalanceSixTotalTolerance,
                functionAllocationMode: algoConfig.functionAllocationMode || 'monthly',
                netTianWeiBalanceEnabled: algoConfig.netTianWeiBalanceEnabled !== false,
                majorFunctionPersonalRatioEnabled: algoConfig.netTianWeiBalanceEnabled !== false,
                continuousRestSoftGoalEnabled: algoConfig.continuousRestSoftGoalEnabled !== false,
                whiteShiftOverageLimit,
                maxExtraDayPerStaff: whiteShiftOverageLimit,
                hardShortageRescueRounds: algoConfig.hardShortageRescueRounds,
                extraByTargetAvgBiasEnabled: algoConfig.extraByTargetAvgBiasEnabled !== false,
                extraByTargetAvgScoreWeight: algoConfig.extraByTargetAvgScoreWeight,
                extraOverTargetLevelPenaltyWeight: algoConfig.extraOverTargetLevelPenaltyWeight,
                extraCapHighTargetReduceStepDays: algoConfig.extraCapHighTargetReduceStepDays,
                extraCapHighTargetReducePerStep: algoConfig.extraCapHighTargetReducePerStep,
                preferredMinWorkDays: Math.max(1, Number(algoConfig.preferredMinWorkDays || 4)),
                preferredMinRestDays: Math.max(1, Number(algoConfig.preferredMinRestDays || 4)),
                preferredLongestRestDays: Math.max(1, Number(algoConfig.preferredLongestRestDays || 4)),
                maxVacationClearSteps: algoConfig.maxVacationClearSteps,
                relaxLevels: [l0, l1, l2, l3],
                cspSolver: {
                    ...(dayShiftRules.cspSolver || {}),
                    maxIterations: algoConfig.maxIterations,
                    backtrackLimit: algoConfig.backtrackLimit,
                    whiteShiftOverageLimit,
                    maxExtraDayPerStaff: whiteShiftOverageLimit,
                    maxEmergencyExtraDayPerStaff: algoConfig.maxEmergencyExtraDayPerStaff,
                    hardShortageRescueRounds: algoConfig.hardShortageRescueRounds,
                    shiftBalanceSixTotalTolerance: algoConfig.shiftBalanceSixTotalTolerance,
                    netTianWeiBalanceEnabled: algoConfig.netTianWeiBalanceEnabled !== false,
                    majorFunctionPersonalRatioEnabled: algoConfig.netTianWeiBalanceEnabled !== false,
                    continuousRestSoftGoalEnabled: algoConfig.continuousRestSoftGoalEnabled !== false,
                    extraByTargetAvgBiasEnabled: algoConfig.extraByTargetAvgBiasEnabled !== false,
                    extraByTargetAvgScoreWeight: algoConfig.extraByTargetAvgScoreWeight,
                    extraOverTargetLevelPenaltyWeight: algoConfig.extraOverTargetLevelPenaltyWeight,
                    extraCapHighTargetReduceStepDays: algoConfig.extraCapHighTargetReduceStepDays,
                    extraCapHighTargetReducePerStep: algoConfig.extraCapHighTargetReducePerStep
                }
            };
            if (runInBackground === true) {
                const curTimeLimit = Math.max(5, Math.floor(Number((mergedRules.mip && mergedRules.mip.timeLimitSec) || 25)));
                const curMipGap = Math.max(0, Number((mergedRules.mip && mergedRules.mip.mipGap) || 0));
                mergedRules.mip = {
                    ...(mergedRules.mip || {}),
                    // 背景任务在主线程执行时，限制单次MIP阻塞时长，保障用户可随时返回页面
                    timeLimitSec: Math.min(curTimeLimit, 10),
                    mipGap: Math.max(curMipGap, 0.02),
                    maxRetryProfiles: 2
                };
            }
            let minimumManpowerConfig = (typeof Store !== 'undefined')
                ? (Store.getState('minimumManpowerConfig') || {})
                : {};
            const manpowerFunctionBaselineRaw = (minimumManpowerConfig
                && minimumManpowerConfig.shanghaiFunctionBaseline
                && typeof minimumManpowerConfig.shanghaiFunctionBaseline === 'object')
                ? minimumManpowerConfig.shanghaiFunctionBaseline
                : null;
            const manpowerFunctionBaseline = {};
            if (manpowerFunctionBaselineRaw) {
                Object.keys(manpowerFunctionBaselineRaw).forEach((k) => {
                    const n = Number(manpowerFunctionBaselineRaw[k]);
                    if (Number.isFinite(n) && n > 0) {
                        manpowerFunctionBaseline[k] = Number(n);
                    }
                });
            }
            if (Object.keys(manpowerFunctionBaseline).length > 0) {
                mergedRules.globalDailyFunctionBaseline = manpowerFunctionBaseline;
                mergedRules.functionBaselineScope = 'shanghai';
                config.algorithmConfig = {
                    ...(config.algorithmConfig || {}),
                    globalDailyFunctionBaseline: JSON.parse(JSON.stringify(manpowerFunctionBaseline))
                };
            }
            let extraWorkPlan = minimumManpowerConfig.extraWorkPlan;
            let extraWorkPlanSnapshot = (extraWorkPlan && typeof extraWorkPlan === 'object')
                ? JSON.parse(JSON.stringify(extraWorkPlan))
                : null;
            let minimumDemandTotal = Object.values(minimumManpowerConfig.dailyDemand || {}).reduce((sum, row) => {
                const dayRow = row || {};
                return sum + this.SHIFT_TYPES.reduce((s, shift) => {
                    const n = Number(dayRow[shift]);
                    return s + (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
                }, 0);
            }, 0);
            const syncExtraWorkPlanToRules = () => {
                delete mergedRules.staffExtraAllowanceDays;
                delete mergedRules.useStaffExtraAllowanceOnly;
                extraWorkPlan = minimumManpowerConfig ? minimumManpowerConfig.extraWorkPlan : null;
                extraWorkPlanSnapshot = (extraWorkPlan && typeof extraWorkPlan === 'object')
                    ? JSON.parse(JSON.stringify(extraWorkPlan))
                    : null;
                minimumDemandTotal = Object.values((minimumManpowerConfig && minimumManpowerConfig.dailyDemand) || {}).reduce((sum, row) => {
                    const dayRow = row || {};
                    return sum + this.SHIFT_TYPES.reduce((s, shift) => {
                        const n = Number(dayRow[shift]);
                        return s + (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
                    }, 0);
                }, 0);
                if (extraWorkPlan && extraWorkPlan.enabled === true && extraWorkPlan.staffExtraDays && typeof extraWorkPlan.staffExtraDays === 'object') {
                    mergedRules.staffExtraAllowanceDays = JSON.parse(JSON.stringify(extraWorkPlan.staffExtraDays));
                    // 启用人员级额外上班策略时，按计划精确限制，不使用统一 +1/+2 回退
                    mergedRules.useStaffExtraAllowanceOnly = true;
                    // 自动补位场景中“额外上班”仅作为可用上限，不应强制抬高目标天数
                    mergedRules.enforcePlannedExtraAsTarget = false;
                }
            };
            syncExtraWorkPlanToRules();
            const cityStrategyPlan = this.buildCityMonthlyShiftStrategyPlan({
                staffData,
                dateList: dateListForSolve,
                requests: requestsForSolve,
                nightShiftTypeMap,
                citySplitStrategy: algoConfig.citySplitStrategy,
                cityShiftSplit: (minimumManpowerConfig && minimumManpowerConfig.cityShiftSplit)
                    ? minimumManpowerConfig.cityShiftSplit
                    : null
            });
            if (cityStrategyPlan && cityStrategyPlan.preferredMap && Object.keys(cityStrategyPlan.preferredMap).length > 0) {
                mergedRules.preferredMonthlyShiftByStaff = this.mergeForcedMonthlyShiftMaps(
                    mergedRules.preferredMonthlyShiftByStaff || {},
                    cityStrategyPlan.preferredMap
                );
            }
            if (
                cityStrategyPlan
                && cityStrategyPlan.strategy === 'city_shift_split'
                && cityStrategyPlan.forcedMap
                && Object.keys(cityStrategyPlan.forcedMap).length > 0
            ) {
                mergedRules.forcedMonthlyShiftByStaff = this.mergeForcedMonthlyShiftMaps(
                    mergedRules.forcedMonthlyShiftByStaff || {},
                    cityStrategyPlan.forcedMap
                );
            }
            const feasibilityPrecheck = this.buildFastFeasibilityPrecheck({
                staffData,
                dateList: dateListForSolve,
                requests: requestsForSolve,
                nightShiftTypeMap,
                dailyDemand: minimumDailyDemand,
                citySplitStrategy: algoConfig.citySplitStrategy,
                cityShiftSplit: (minimumManpowerConfig && minimumManpowerConfig.cityShiftSplit)
                    ? minimumManpowerConfig.cityShiftSplit
                    : null
            });
            if (feasibilityPrecheck && feasibilityPrecheck.hasRisk) {
                await this.updateGenerationJob(configId, {
                    progress: 20,
                    stageKey: 'precheck',
                    message: `可行性快检发现风险：下界缺口 ${Number(feasibilityPrecheck.infeasibleLowerBound || 0)}，继续执行主求解与托底链路...`
                });
                await this.yieldToUi();
            }
            const requestedModeRaw = String(algoConfig.algorithmMode || 'hybrid').toLowerCase();
            const requestedMode = requestedModeRaw === 'csp'
                ? 'csp'
                : (requestedModeRaw === 'hybrid' ? 'hybrid' : 'mip');
            const primarySolveMode = requestedMode === 'csp' ? 'csp' : 'mip';
            const strictMIP = primarySolveMode === 'mip' && (algoConfig.strictMIP !== false);
            const allowCspFallbackOnMipFailure = primarySolveMode === 'mip' && (
                requestedMode === 'hybrid' ? true : (algoConfig.allowCspFallbackOnMipFailure !== false)
            );
            const allowCspRescueWhenHardViolation = primarySolveMode === 'mip' && (
                requestedMode === 'hybrid' ? true : (algoConfig.allowCspRescueWhenHardViolation !== false)
            );
            const restDaysForSolve = Store.getAllRestDays ? (Store.getAllRestDays() || {}) : {};
            const runSolve = async (personalRequestsForRun, modeOverride = null, rulesOverride = null) => {
                const solverInput = {
                    staffData,
                    scheduleConfig,
                    personalRequests: personalRequestsForRun,
                    restDays: restDaysForSolve,
                    nightSchedule,
                    citySplitStrategy: String((rulesOverride || mergedRules || {}).citySplitStrategy || algoConfig.citySplitStrategy || 'home_city').toLowerCase() === 'city_shift_split'
                        ? 'city_shift_split'
                        : 'home_city',
                    cityShiftSplit: (minimumManpowerConfig && minimumManpowerConfig.cityShiftSplit)
                        ? JSON.parse(JSON.stringify(minimumManpowerConfig.cityShiftSplit))
                        : null,
                    scenarioSkillDemand: (minimumManpowerConfig && minimumManpowerConfig.scenarioSkillDemand)
                        ? JSON.parse(JSON.stringify(minimumManpowerConfig.scenarioSkillDemand))
                        : null,
                    rules: rulesOverride || mergedRules
                };
                const modeToUse = (modeOverride === 'csp' || modeOverride === 'mip') ? modeOverride : primarySolveMode;
                let modeUsed = modeToUse;
                let fallback = '';
                let result = null;
                if (modeToUse === 'mip') {
                    const mipSolver = (typeof MIPDayShiftSolver !== 'undefined' && MIPDayShiftSolver)
                        ? MIPDayShiftSolver
                        : (typeof window !== 'undefined' ? window.MIPDayShiftSolver : null);
                    if (mipSolver && typeof mipSolver.generateDayShiftScheduleMIP === 'function') {
                        try {
                            result = await mipSolver.generateDayShiftScheduleMIP(solverInput);
                        } catch (mipError) {
                            const reason = mipError && mipError.message ? mipError.message : '未知错误';
                            if (!allowCspFallbackOnMipFailure) {
                                throw new Error(`MIP 求解失败（已禁用CSP托底）：${reason}`);
                            }
                            modeUsed = 'csp';
                            fallback = strictMIP
                                ? `严格MIP首选未成功，已启用CSP托底：${reason}`
                                : `MIP 求解失败，已自动回退 CSP：${reason}`;
                            console.warn('[MonthlyScheduleConfigManager] MIP 求解失败，回退 CSP:', mipError);
                        }
                    } else {
                        if (!allowCspFallbackOnMipFailure) {
                            throw new Error('MIP 求解器未接入（已禁用CSP托底）');
                        }
                        modeUsed = 'csp';
                        fallback = strictMIP
                            ? '严格MIP首选未接入，已启用CSP托底'
                            : 'MIP 求解器未接入，已自动回退 CSP';
                    }
                } else {
                    modeUsed = 'csp';
                }
                if (!result) {
                    result = await CSPSolver.generateDayShiftSchedule(solverInput);
                }
                return { result, modeUsed, fallback };
            };

            const cloneJson = (obj) => JSON.parse(JSON.stringify(obj || {}));
            const deepMerge = (base, patch) => {
                const out = cloneJson(base || {});
                if (!patch || typeof patch !== 'object') return out;
                Object.keys(patch).forEach((k) => {
                    const pv = patch[k];
                    if (Array.isArray(pv)) {
                        out[k] = pv.slice();
                    } else if (pv && typeof pv === 'object') {
                        out[k] = deepMerge(out[k] && typeof out[k] === 'object' ? out[k] : {}, pv);
                    } else {
                        out[k] = pv;
                    }
                });
                return out;
            };
            const baseForcedMonthlyShiftByStaff = cloneJson(mergedRules.forcedMonthlyShiftByStaff || {});
            const basePreferredMonthlyShiftByStaff = cloneJson(mergedRules.preferredMonthlyShiftByStaff || {});
            const readHard = (solveResult) => {
                const hard = (solveResult && solveResult.stats && solveResult.stats.hardViolations)
                    ? solveResult.stats.hardViolations
                    : {};
                return {
                    total: Number(hard.total || 0),
                    dailyShortage: Number(hard.dailyShortage || 0),
                    targetMismatch: Number(hard.targetMismatch || 0),
                    targetOverflow: Number(hard.targetOverflow || 0),
                    shortageByDate: hard.shortageByDate || {}
                };
            };
            const betterHard = (a, b) => {
                if (!b) return true;
                if (a.dailyShortage !== b.dailyShortage) return a.dailyShortage < b.dailyShortage;
                if (a.total !== b.total) return a.total < b.total;
                if (a.targetMismatch !== b.targetMismatch) return a.targetMismatch < b.targetMismatch;
                if (a.targetOverflow !== b.targetOverflow) return a.targetOverflow < b.targetOverflow;
                return false;
            };
            const buildAdaptiveIterationConfig = (iter) => {
                const baseTime = Math.max(5, Math.floor(Number((mergedRules.mip && mergedRules.mip.timeLimitSec) || 25)));
                const shortageWeight = Math.min(5200000, 2200000 + iter * 450000);
                const underTargetWeight = Math.min(3200000, 1500000 + iter * 320000);
                const overTargetWeight = Math.min(3000000, 1400000 + iter * 280000);
                const timeLimit = Math.min(140, baseTime + iter * (strictMIP ? 16 : 10));
                return {
                    id: iter === 0 ? 'A0_BASE' : `A${iter}_ADAPT`,
                    name: iter === 0 ? '基线求解' : `自适应迭代${iter}`,
                    maxReassignMoves: iter <= 0 ? 0 : Math.min(strictMIP ? 24 : 12, 4 + iter * 4),
                    allowDropWithoutMove: iter >= 3,
                    maxDropCount: iter >= 3 ? Math.min(strictMIP ? 48 : 24, (iter - 2) * (strictMIP ? 10 : 5)) : 0,
                    rulePatch: {
                        allowEmergencyOverTarget: iter >= 2,
                        monthlyShiftChangePenalty: iter === 0 ? 140 : Math.max(18, 90 - iter * 10),
                        mip: {
                            timeLimitSec: timeLimit,
                            objectiveWeights: {
                                shortage: shortageWeight,
                                underTarget: underTargetWeight,
                                overTarget: overTargetWeight,
                                windowViolation: iter <= 1 ? 1200 : 700,
                                transition: iter <= 1 ? 10 : 6,
                                shortWork1: iter <= 1 ? 25 : 12,
                                shortWork2: iter <= 1 ? 16 : 8,
                                shortWork3: iter <= 1 ? 8 : 4,
                                shortRest1: iter <= 1 ? 20 : 10
                            }
                        }
                    }
                };
            };

            const baseRequestsForRetry = cloneJson(requestsForSolve);
            const baseRulesForRetry = cloneJson(mergedRules);
            const retryAttemptLogs = [];
            const maxAdaptiveIterations = primarySolveMode === 'mip'
                ? (strictMIP ? 6 : 4)
                : 1;
            await this.updateGenerationJob(configId, {
                progress: 22,
                stageKey: 'solving_base',
                message: `开始执行 ${maxAdaptiveIterations} 轮主从迭代（模式: ${requestedMode.toUpperCase()}）`
            });
            await this.yieldToUi();

            const solveAdaptiveState = async (state, iterCfg) => {
                const runtimePatch = deepMerge(iterCfg.rulePatch || {}, {
                    forcedMonthlyShiftByStaff: cloneJson(state.forcedMonthlyShiftByStaff || {}),
                    preferredMonthlyShiftByStaff: cloneJson(state.preferredMonthlyShiftByStaff || {})
                });
                const runtimeRules = deepMerge(baseRulesForRetry, runtimePatch || {});
                const solved = await runSolve(state.requests, primarySolveMode, runtimeRules);
                return {
                    result: solved.result,
                    modeUsed: solved.modeUsed,
                    fallback: solved.fallback,
                    rules: runtimeRules
                };
            };

            let acceptedState = {
                requests: cloneJson(baseRequestsForRetry),
                forcedMonthlyShiftByStaff: cloneJson(baseForcedMonthlyShiftByStaff),
                preferredMonthlyShiftByStaff: cloneJson(basePreferredMonthlyShiftByStaff)
            };
            let acceptedSolve = null;
            let bestAttempt = null;

            for (let iter = 0; iter < maxAdaptiveIterations; iter++) {
                const iterCfg = buildAdaptiveIterationConfig(iter);
                updateStatus(`正在执行排班主从迭代 ${iter + 1}/${maxAdaptiveIterations}：${iterCfg.name}`, 'info');
                const baseProgress = 22 + Math.round(((iter + 1) / Math.max(1, maxAdaptiveIterations)) * 46);
                await this.updateGenerationJob(configId, {
                    progress: baseProgress,
                    stageKey: iter <= 0 ? 'solving_base' : 'solving_adaptive',
                    message: `迭代 ${iter + 1}/${maxAdaptiveIterations}：${iterCfg.name}`
                });
                await this.yieldToUi();

                if (iter === 0) {
                    const baselineSolve = await solveAdaptiveState(acceptedState, iterCfg);
                    const baselineHard = readHard(baselineSolve.result);
                    acceptedSolve = baselineSolve;
                    acceptedState.preferredMonthlyShiftByStaff = cloneJson(
                        (baselineSolve.result && baselineSolve.result.stats && baselineSolve.result.stats.monthlyShiftAssignments) || {}
                    );
                    retryAttemptLogs.push({
                        profileId: iterCfg.id,
                        profileName: iterCfg.name,
                        beforeHard: baselineHard,
                        afterHard: baselineHard,
                        hard: baselineHard,
                        movedCount: 0,
                        rounds: 0,
                        roundLogs: [],
                        monthlyReassign: null
                    });
                    bestAttempt = {
                        profileId: iterCfg.id,
                        profileName: iterCfg.name,
                        result: baselineSolve.result,
                        requests: cloneJson(acceptedState.requests),
                        forcedMonthlyShiftByStaff: cloneJson(acceptedState.forcedMonthlyShiftByStaff),
                        preferredMonthlyShiftByStaff: cloneJson(acceptedState.preferredMonthlyShiftByStaff),
                        modeUsed: baselineSolve.modeUsed,
                        fallback: baselineSolve.fallback || '',
                        hard: baselineHard,
                        roundLogs: [],
                        movedCount: 0
                    };
                    if (baselineHard.dailyShortage <= 0 && baselineHard.total <= 0 && Number(baselineHard.targetOverflow || 0) <= 0) {
                        break;
                    }
                    continue;
                }

                if (!acceptedSolve || !acceptedSolve.result) {
                    break;
                }

                const beforeHard = readHard(acceptedSolve.result);
                if (beforeHard.dailyShortage <= 0 && beforeHard.total <= 0 && Number(beforeHard.targetOverflow || 0) <= 0) {
                    break;
                }

                const currentMonthlyShiftAssignments = (acceptedSolve.result.stats && acceptedSolve.result.stats.monthlyShiftAssignments)
                    ? acceptedSolve.result.stats.monthlyShiftAssignments
                    : {};
                const currentTargetDaysByStaff = (acceptedSolve.result.stats && acceptedSolve.result.stats.targetDaysByStaff)
                    ? acceptedSolve.result.stats.targetDaysByStaff
                    : {};
                acceptedState.preferredMonthlyShiftByStaff = cloneJson(currentMonthlyShiftAssignments || {});

                const candidatePlans = this.buildAdaptiveRetryCandidates({
                    staffData,
                    dateList: dateListForSolve,
                    requests: acceptedState.requests,
                    nightShiftTypeMap,
                    dailyDemand: minimumDailyDemand,
                    monthlyShiftAssignments: currentMonthlyShiftAssignments,
                    targetDaysByStaff: currentTargetDaysByStaff,
                    shortageByDate: beforeHard.shortageByDate,
                    targetOverflow: Number(beforeHard.targetOverflow || 0),
                    iteration: iter,
                    strictMIP,
                    allowDropWithoutMove: iterCfg.allowDropWithoutMove === true,
                    maxDropCount: iterCfg.maxDropCount,
                    maxReassignMoves: iterCfg.maxReassignMoves
                });

                if (!Array.isArray(candidatePlans) || candidatePlans.length === 0) {
                    retryAttemptLogs.push({
                        profileId: iterCfg.id,
                        profileName: `${iterCfg.name}(无候选)`,
                        beforeHard,
                        afterHard: beforeHard,
                        hard: beforeHard,
                        movedCount: 0,
                        rounds: 0,
                        roundLogs: [],
                        monthlyReassign: null
                    });
                    break;
                }

                let acceptedCandidate = null;
                const roundLogs = [];
                for (let cIdx = 0; cIdx < candidatePlans.length; cIdx++) {
                    const candidatePlan = candidatePlans[cIdx];
                    updateStatus(`正在执行排班主从迭代 ${iter + 1}/${maxAdaptiveIterations}：${iterCfg.name}，候选 ${cIdx + 1}/${candidatePlans.length}`, 'info');
                    await this.updateGenerationJob(configId, {
                        progress: Math.min(76, baseProgress + Math.round(((cIdx + 1) / Math.max(1, candidatePlans.length)) * 6)),
                        stageKey: 'solving_adaptive',
                        message: `迭代 ${iter + 1}/${maxAdaptiveIterations} 候选 ${cIdx + 1}/${candidatePlans.length}`
                    });
                    await this.yieldToUi();
                    const candidateState = {
                        requests: cloneJson(candidatePlan.adjustedRequests || acceptedState.requests),
                        forcedMonthlyShiftByStaff: this.mergeForcedMonthlyShiftMaps(
                            acceptedState.forcedMonthlyShiftByStaff || {},
                            candidatePlan.forcedMap || {}
                        ),
                        preferredMonthlyShiftByStaff: cloneJson(currentMonthlyShiftAssignments || {})
                    };

                    const candidateSolve = await solveAdaptiveState(candidateState, iterCfg);
                    const candidateHard = readHard(candidateSolve.result);
                    const improved = betterHard(candidateHard, beforeHard);

                    roundLogs.push({
                        round: cIdx + 1,
                        candidateId: candidatePlan.candidateId || `C${cIdx + 1}`,
                        candidateName: candidatePlan.candidateName || `候选${cIdx + 1}`,
                        movedCount: Number(candidatePlan.movedCount || 0),
                        dropCount: Number(candidatePlan.dropCount || 0),
                        improved,
                        rolledBack: !improved,
                        beforeTotal: beforeHard.total,
                        afterTotal: candidateHard.total,
                        beforeShortage: beforeHard.dailyShortage,
                        afterShortage: candidateHard.dailyShortage,
                        beforeTargetMismatch: beforeHard.targetMismatch,
                        afterTargetMismatch: candidateHard.targetMismatch,
                        beforeTargetOverflow: beforeHard.targetOverflow,
                        afterTargetOverflow: candidateHard.targetOverflow,
                        sampleMoves: (candidatePlan.moveLogs || []).slice(0, 10),
                        forcedCount: candidatePlan.monthlyReassign ? Number(candidatePlan.monthlyReassign.forcedCount || 0) : 0
                    });

                    if (!acceptedCandidate || betterHard(candidateHard, acceptedCandidate.hard)) {
                        acceptedCandidate = {
                            state: candidateState,
                            result: candidateSolve.result,
                            modeUsed: candidateSolve.modeUsed,
                            fallback: candidateSolve.fallback || '',
                            hard: candidateHard,
                            candidatePlan
                        };
                    }
                }

                const acceptedImproved = !!(acceptedCandidate && betterHard(acceptedCandidate.hard, beforeHard));
                retryAttemptLogs.push({
                    profileId: iterCfg.id,
                    profileName: iterCfg.name,
                    beforeHard,
                    afterHard: acceptedImproved ? acceptedCandidate.hard : beforeHard,
                    hard: acceptedImproved ? acceptedCandidate.hard : beforeHard,
                    movedCount: acceptedImproved ? Number(acceptedCandidate.candidatePlan.movedCount || 0) : 0,
                    rounds: roundLogs.length,
                    roundLogs,
                    monthlyReassign: acceptedImproved && acceptedCandidate.candidatePlan.monthlyReassign
                        ? {
                            forcedCount: Number(acceptedCandidate.candidatePlan.monthlyReassign.forcedCount || 0),
                            moveLogs: (acceptedCandidate.candidatePlan.monthlyReassign.moveLogs || []).slice(0, 20),
                            shortageByShift: acceptedCandidate.candidatePlan.monthlyReassign.shortageByShift || {},
                            skipped: acceptedCandidate.candidatePlan.monthlyReassign.skipped === true,
                            reason: acceptedCandidate.candidatePlan.monthlyReassign.reason || ''
                        }
                        : null
                });

                if (!acceptedImproved) {
                    break;
                }

                acceptedState = acceptedCandidate.state;
                acceptedState.preferredMonthlyShiftByStaff = cloneJson(
                    (acceptedCandidate.result && acceptedCandidate.result.stats && acceptedCandidate.result.stats.monthlyShiftAssignments) || currentMonthlyShiftAssignments || {}
                );
                acceptedSolve = {
                    result: acceptedCandidate.result,
                    modeUsed: acceptedCandidate.modeUsed,
                    fallback: acceptedCandidate.fallback
                };

                const candidateAttempt = {
                    profileId: iterCfg.id,
                    profileName: iterCfg.name,
                    result: acceptedCandidate.result,
                    requests: cloneJson(acceptedState.requests),
                    forcedMonthlyShiftByStaff: cloneJson(acceptedState.forcedMonthlyShiftByStaff),
                    preferredMonthlyShiftByStaff: cloneJson(acceptedState.preferredMonthlyShiftByStaff),
                    modeUsed: acceptedCandidate.modeUsed,
                    fallback: acceptedCandidate.fallback || '',
                    hard: acceptedCandidate.hard,
                    roundLogs,
                    movedCount: Number(acceptedCandidate.candidatePlan.movedCount || 0)
                };
                if (!bestAttempt || betterHard(candidateAttempt.hard, bestAttempt.hard)) {
                    bestAttempt = candidateAttempt;
                }
                if (candidateAttempt.hard.dailyShortage <= 0 && candidateAttempt.hard.total <= 0) {
                    break;
                }
            }

            let minimumAutoRepairFlow = null;
            if (bestAttempt && Number((bestAttempt.hard && bestAttempt.hard.dailyShortage) || 0) > 0) {
                await this.updateGenerationJob(configId, {
                    progress: 74,
                    stageKey: 'solving_repair',
                    message: '检测到缺班缺口，正在执行最低人力自动修复...'
                });
                await this.yieldToUi();
                const minimumMgr = (typeof MinimumManpowerManager !== 'undefined')
                    ? MinimumManpowerManager
                    : (typeof window !== 'undefined' ? window.MinimumManpowerManager : null);
                if (minimumMgr
                    && typeof minimumMgr.cloneConfig === 'function'
                    && typeof minimumMgr.buildManpowerGapAnalysis === 'function'
                    && typeof minimumMgr.applyExtraWorkPlusOne === 'function'
                    && typeof minimumMgr.applyExtraWorkPlusTwo === 'function') {
                    try {
                        const mmDateList = (typeof minimumMgr.getDateList === 'function')
                            ? minimumMgr.getDateList(scheduleConfig.startDate, scheduleConfig.endDate)
                            : (dateListForSolve || []).map((d) => ({ dateStr: d }));
                        const mmConfig = minimumMgr.cloneConfig(minimumManpowerConfig || {});
                        if (mmConfig && mmConfig.dailyDemand) {
                            const beforeGap = minimumMgr.buildManpowerGapAnalysis(mmConfig, mmDateList);
                            let currentGap = beforeGap;
                            const steps = [];
                            let changed = false;

                            if (Number(currentGap.lowerBoundGap || 0) > 0) {
                                const plus1 = minimumMgr.applyExtraWorkPlusOne(mmConfig, mmDateList);
                                if (plus1 && Number(plus1.applied || 0) > 0) {
                                    changed = true;
                                    steps.push(`+1(${Number(plus1.applied || 0)}人)`);
                                    currentGap = minimumMgr.buildManpowerGapAnalysis(mmConfig, mmDateList);
                                }
                            }

                            if (Number(currentGap.lowerBoundGap || 0) > 0) {
                                const plus2 = minimumMgr.applyExtraWorkPlusTwo(mmConfig, mmDateList);
                                const plus2Changed = Number(plus2 && plus2.appliedStage1 || 0) + Number(plus2 && plus2.appliedStage2 || 0);
                                if (plus2Changed > 0) {
                                    changed = true;
                                    steps.push(`+2(${Number(plus2.appliedStage2 || 0)}人)`);
                                    currentGap = minimumMgr.buildManpowerGapAnalysis(mmConfig, mmDateList);
                                }
                            }

                            if (Number(currentGap.lowerBoundGap || 0) > 0 && typeof minimumMgr.applyMergeReliefPlan === 'function') {
                                let mergeAppliedTotal = 0;
                                let mergeRound = 0;
                                while (Number(currentGap.lowerBoundGap || 0) > 0 && mergeRound < 8) {
                                    const beforeMergeGap = Number(currentGap.lowerBoundGap || 0);
                                    const merge = minimumMgr.applyMergeReliefPlan(mmConfig, mmDateList, currentGap);
                                    const applied = Number(merge && merge.applied || 0);
                                    if (applied <= 0) {
                                        break;
                                    }
                                    mergeAppliedTotal += applied;
                                    changed = true;
                                    currentGap = minimumMgr.buildManpowerGapAnalysis(mmConfig, mmDateList);
                                    const afterMergeGap = Number(currentGap.lowerBoundGap || 0);
                                    mergeRound += 1;
                                    if (afterMergeGap >= beforeMergeGap) {
                                        // 无明显改善时及时停止，避免无效循环
                                        break;
                                    }
                                }
                                if (mergeAppliedTotal > 0) {
                                    steps.push(`合班减缺(${mergeAppliedTotal}次)`);
                                }
                            }

                            const afterGap = minimumMgr.buildManpowerGapAnalysis(mmConfig, mmDateList);
                            minimumAutoRepairFlow = {
                                applied: changed,
                                beforeLowerBoundGap: Number(beforeGap.lowerBoundGap || 0),
                                afterLowerBoundGap: Number(afterGap.lowerBoundGap || 0),
                                beforeCapacityGap: Number(beforeGap.capacityGap || 0),
                                afterCapacityGap: Number(afterGap.capacityGap || 0),
                                steps: steps.slice(),
                                beforeDailyGapTop: (beforeGap.dailyGapRows || []).slice(0, 10),
                                afterDailyGapTop: (afterGap.dailyGapRows || []).slice(0, 10)
                            };

                            if (changed) {
                                const minimumConfigBeforeAutoRepair = cloneJson(minimumManpowerConfig || {});
                                if (typeof minimumMgr.clearCompensationPlan === 'function') {
                                    minimumMgr.clearCompensationPlan(mmConfig);
                                }
                                if (typeof minimumMgr.persistConfig === 'function') {
                                    minimumMgr.persistConfig(mmConfig, true);
                                } else if (typeof Store !== 'undefined' && typeof Store.updateState === 'function') {
                                    Store.updateState({ minimumManpowerConfig: mmConfig }, true);
                                }
                                minimumManpowerConfig = mmConfig;
                                syncExtraWorkPlanToRules();
                                // 同步主重试基线规则，保证后续 runSolve/csp fallback 使用最新 extraWorkPlan
                                Object.keys(baseRulesForRetry).forEach((k) => { delete baseRulesForRetry[k]; });
                                Object.assign(baseRulesForRetry, cloneJson(mergedRules));

                                const postRepairRules = deepMerge(
                                    buildAdaptiveIterationConfig(Math.max(2, maxAdaptiveIterations - 1)).rulePatch || {},
                                    {
                                        forcedMonthlyShiftByStaff: cloneJson(bestAttempt.forcedMonthlyShiftByStaff || {}),
                                        preferredMonthlyShiftByStaff: cloneJson(bestAttempt.preferredMonthlyShiftByStaff || {})
                                    }
                                );
                                const postRepairSolve = await runSolve(
                                    bestAttempt.requests || acceptedState.requests || cloneJson(baseRequestsForRetry),
                                    primarySolveMode,
                                    deepMerge(baseRulesForRetry, postRepairRules)
                                );
                                const postRepairHard = readHard(postRepairSolve.result);
                                retryAttemptLogs.push({
                                    profileId: 'M0_MINIMUM_AUTOREPAIR',
                                    profileName: `最低人力自动修复(${steps.join('，') || '无变更'})`,
                                    beforeHard: bestAttempt.hard,
                                    afterHard: postRepairHard,
                                    hard: postRepairHard,
                                    movedCount: 0,
                                    rounds: 1,
                                    roundLogs: [],
                                    monthlyReassign: null
                                });
                                if (betterHard(postRepairHard, bestAttempt.hard)) {
                                    bestAttempt = {
                                        profileId: 'M0_MINIMUM_AUTOREPAIR',
                                        profileName: `最低人力自动修复(${steps.join('，') || '无变更'})`,
                                        result: postRepairSolve.result,
                                        requests: cloneJson(bestAttempt.requests || acceptedState.requests || baseRequestsForRetry),
                                        forcedMonthlyShiftByStaff: cloneJson(bestAttempt.forcedMonthlyShiftByStaff || {}),
                                        preferredMonthlyShiftByStaff: cloneJson(bestAttempt.preferredMonthlyShiftByStaff || {}),
                                        modeUsed: postRepairSolve.modeUsed,
                                        fallback: postRepairSolve.fallback || '',
                                        hard: postRepairHard,
                                        roundLogs: [],
                                        movedCount: 0
                                    };
                                } else {
                                    // 自动修复若未改善，回滚最低人力配置，避免污染后续求解
                                    if (typeof minimumMgr.persistConfig === 'function') {
                                        minimumMgr.persistConfig(minimumConfigBeforeAutoRepair, true);
                                    } else if (typeof Store !== 'undefined' && typeof Store.updateState === 'function') {
                                        Store.updateState({ minimumManpowerConfig: minimumConfigBeforeAutoRepair }, true);
                                    }
                                    minimumManpowerConfig = minimumConfigBeforeAutoRepair;
                                    syncExtraWorkPlanToRules();
                                    Object.keys(baseRulesForRetry).forEach((k) => { delete baseRulesForRetry[k]; });
                                    Object.assign(baseRulesForRetry, cloneJson(mergedRules));
                                }
                            }
                        }
                    } catch (minimumRepairError) {
                        console.warn('[MonthlyScheduleConfigManager] 最低人力自动修复执行失败:', minimumRepairError);
                        minimumAutoRepairFlow = {
                            applied: false,
                            error: minimumRepairError && minimumRepairError.message
                                ? minimumRepairError.message
                                : String(minimumRepairError || 'unknown')
                        };
                    }
                }
            }

            let usedRequestsForSolve = bestAttempt ? bestAttempt.requests : cloneJson(baseRequestsForRetry);
            let dayShiftResult = bestAttempt ? bestAttempt.result : (await runSolve(usedRequestsForSolve, primarySolveMode, baseRulesForRetry)).result;
            let solverModeUsed = bestAttempt ? bestAttempt.modeUsed : primarySolveMode;
            let fallbackReason = bestAttempt ? bestAttempt.fallback : '';
            let shiftShortageRebalance = null;
            if (retryAttemptLogs.length > 0) {
                const firstAttempt = retryAttemptLogs[0] || {};
                const beforeHard = (firstAttempt.beforeHard && typeof firstAttempt.beforeHard === 'object')
                    ? firstAttempt.beforeHard
                    : (bestAttempt ? bestAttempt.hard : { total: 0, dailyShortage: 0, targetMismatch: 0, targetOverflow: 0 });
                const afterHard = bestAttempt ? bestAttempt.hard : beforeHard;
                const bestRoundLogs = (bestAttempt && Array.isArray(bestAttempt.roundLogs))
                    ? bestAttempt.roundLogs
                    : [];
                const improvedAny = bestRoundLogs.some((r) => r.improved === true)
                    || betterHard(afterHard, beforeHard);
                const mergedSample = [];
                bestRoundLogs.forEach((r) => {
                    (r.sampleMoves || []).forEach((m) => {
                        if (mergedSample.length < 30) mergedSample.push(m);
                    });
                });
                shiftShortageRebalance = {
                    profileId: bestAttempt ? bestAttempt.profileId : (firstAttempt.profileId || ''),
                    profileName: bestAttempt ? bestAttempt.profileName : (firstAttempt.profileName || ''),
                    attemptLogs: retryAttemptLogs,
                    rounds: bestRoundLogs.length,
                    movedCount: Number(bestAttempt ? (bestAttempt.movedCount || 0) : 0),
                    improved: improvedAny,
                    beforeTotal: Number(beforeHard.total || 0),
                    afterTotal: Number(afterHard.total || 0),
                    beforeShortage: Number(beforeHard.dailyShortage || 0),
                    afterShortage: Number(afterHard.dailyShortage || 0),
                    sampleMoves: mergedSample
                };
            }

            await this.updateGenerationJob(configId, {
                progress: 82,
                stageKey: 'solving_finalize',
                message: '主求解已完成，正在执行终局校验...'
            });
            await this.yieldToUi();
            const hardAfterRebalance = readHard(dayShiftResult);
            if (solverModeUsed === 'mip' && Number(hardAfterRebalance.total || 0) > 0 && allowCspRescueWhenHardViolation) {
                const cspRescueRules = deepMerge(baseRulesForRetry, {
                    allowEmergencyOverTarget: true,
                    cspSolver: {
                        maxExtraDayPerStaff: Math.max(0, Number(algoConfig.whiteShiftOverageLimit || algoConfig.maxExtraDayPerStaff || 0)),
                        maxEmergencyExtraDayPerStaff: Number(algoConfig.maxEmergencyExtraDayPerStaff || 0),
                        hardShortageRescueRounds: Math.max(1, Number(algoConfig.hardShortageRescueRounds || 2)),
                        shiftBalanceSixTotalTolerance: Number(algoConfig.shiftBalanceSixTotalTolerance || 1),
                        netTianWeiBalanceEnabled: algoConfig.netTianWeiBalanceEnabled !== false,
                        majorFunctionPersonalRatioEnabled: algoConfig.netTianWeiBalanceEnabled !== false,
                        continuousRestSoftGoalEnabled: algoConfig.continuousRestSoftGoalEnabled !== false,
                        extraByTargetAvgBiasEnabled: algoConfig.extraByTargetAvgBiasEnabled !== false,
                        extraByTargetAvgScoreWeight: Number(algoConfig.extraByTargetAvgScoreWeight || 180),
                        extraOverTargetLevelPenaltyWeight: Number(algoConfig.extraOverTargetLevelPenaltyWeight || 120),
                        extraCapHighTargetReduceStepDays: Math.max(1, Number(algoConfig.extraCapHighTargetReduceStepDays || 2)),
                        extraCapHighTargetReducePerStep: Math.max(0, Number(algoConfig.extraCapHighTargetReducePerStep || 1)),
                        maxIterations: Math.max(1600, Number(algoConfig.maxIterations || 1000)),
                        backtrackLimit: Math.max(180, Number(algoConfig.backtrackLimit || 100))
                    }
                });
                const cspRun = await runSolve(usedRequestsForSolve, 'csp', cspRescueRules);
                const cspResult = cspRun.result;
                const cspHard = readHard(cspResult);
                const mipTotal = Number(hardAfterRebalance.total || 0);
                const cspTotal = Number(cspHard.total || 0);
                const mipShort = Number(hardAfterRebalance.dailyShortage || 0);
                const cspShort = Number(cspHard.dailyShortage || 0);
                if (cspTotal < mipTotal || (cspTotal === mipTotal && cspShort < mipShort)) {
                    dayShiftResult = cspResult;
                    solverModeUsed = 'csp';
                    fallbackReason = [fallbackReason, `MIP 结果未达硬约束，已切换 CSP 救援并取得更优结果（${mipTotal}->${cspTotal}）`]
                        .filter(Boolean)
                        .join('；');
                } else {
                    fallbackReason = [fallbackReason, `MIP 结果未达硬约束，已尝试 CSP 救援但未优于 MIP（${mipTotal}->${cspTotal}）`]
                        .filter(Boolean)
                        .join('；');
                }
            } else if (solverModeUsed === 'mip' && Number(hardAfterRebalance.total || 0) > 0 && !allowCspRescueWhenHardViolation) {
                fallbackReason = [fallbackReason, 'MIP 结果存在硬约束缺口，已按配置禁用 CSP 救援']
                    .filter(Boolean)
                    .join('；');
            }

            const scheduleByStaff = dayShiftResult.schedule || {};
            const functionByStaff = dayShiftResult.functionSchedule || {};
            const stats = dayShiftResult.stats || {};
            const monthlyShiftAssignments = stats.monthlyShiftAssignments || {};
            const missingFunctionSlots = [];

            // 4) 回填到月度班次配置
            const nextStaffScheduleData = {};
            staffData.forEach((staff) => {
                const staffId = String(staff.staffId || staff.id || '').trim();
                if (!staffId) return;

                const oldRow = config.staffScheduleData[staffId] || {};
                const rowSchedule = scheduleByStaff[staffId] || {};
                const rowFunctionSchedule = functionByStaff[staffId] || {};
                const dailySchedule = {};
                const normalizedStaff = (typeof CityUtils !== 'undefined' && CityUtils.normalizeStaffCityFields)
                    ? CityUtils.normalizeStaffCityFields({ ...(staff || {}), ...(oldRow || {}) }, 'SH')
                    : ({
                        city: String((oldRow && oldRow.city) || (staff && staff.city) || '').toUpperCase() === 'CD' ? 'CD' : 'SH',
                        location: String((oldRow && oldRow.location) || (staff && staff.location) || '') === '成都' ? '成都' : '上海'
                    });

                Object.entries(rowSchedule).forEach(([dateStr, shift]) => {
                    if (this.SHIFT_TYPES.includes(shift)) {
                        const fn = rowFunctionSchedule[dateStr];
                        if (fn) {
                            dailySchedule[dateStr] = fn;
                        } else {
                            missingFunctionSlots.push(`${staffId}:${dateStr}`);
                        }
                    }
                });

                nextStaffScheduleData[staffId] = {
                    staffId,
                    staffName: oldRow.staffName || staff.staffName || staff.name || '',
                    city: normalizedStaff.city,
                    location: normalizedStaff.location,
                    shiftType: monthlyShiftAssignments[staffId] || oldRow.shiftType || '',
                    dailySchedule
                };
            });

            config.staffScheduleData = nextStaffScheduleData;
            config.dayShiftReport = {
                generatedAt: new Date().toISOString(),
                source: 'monthlyScheduleGenerate',
                stats,
                meta: {
                    ...(dayShiftResult.meta || {}),
                    nightShiftTypeMapSnapshot: JSON.parse(JSON.stringify(nightShiftTypeMap || {})),
                    solver: {
                        requestedMode,
                        usedMode: solverModeUsed,
                        strictMIP,
                        fallbackReason: fallbackReason || null
                    },
                    minimumManpower: {
                        periodKey: minimumManpowerConfig.periodKey || null,
                        demandTotal: minimumDemandTotal,
                        useStaffExtraAllowanceOnly: mergedRules.useStaffExtraAllowanceOnly === true,
                        citySplitStrategy: cityStrategyPlan
                            ? cityStrategyPlan.strategy
                            : (String(algoConfig.citySplitStrategy || 'home_city').toLowerCase() === 'city_shift_split' ? 'city_shift_split' : 'home_city'),
                        cityShiftPlan: cityStrategyPlan
                            ? {
                                forcedCount: Number(cityStrategyPlan.forcedCount || 0),
                                preferredCount: Number(cityStrategyPlan.preferredCount || 0),
                                cityTargetHeadcount: JSON.parse(JSON.stringify(cityStrategyPlan.cityTargetHeadcount || {})),
                                cityAssignedHeadcount: JSON.parse(JSON.stringify(cityStrategyPlan.cityAssignedHeadcount || {}))
                            }
                            : null,
                        feasibilityPrecheck: feasibilityPrecheck
                            ? JSON.parse(JSON.stringify(feasibilityPrecheck))
                            : null,
                        extraWorkPlan: extraWorkPlanSnapshot,
                        autoRepair: minimumAutoRepairFlow
                            ? JSON.parse(JSON.stringify(minimumAutoRepairFlow))
                            : null,
                        specialRestRebalance: specialRestRebalance
                            ? {
                                movedCount: Number(specialRestRebalance.movedCount || 0),
                                beforeShortage: Number(specialRestRebalance.beforeShortage || 0),
                                afterShortage: Number(specialRestRebalance.afterShortage || 0),
                                unresolvedShortage: Number(specialRestRebalance.unresolvedShortage || 0),
                                sampleMoves: (specialRestRebalance.moveLogs || []).slice(0, 30)
                            }
                            : null,
                        shiftShortageRebalance: shiftShortageRebalance
                            ? JSON.parse(JSON.stringify(shiftShortageRebalance))
                            : null,
                        shanghaiFunctionBaseline: Object.keys(manpowerFunctionBaseline || {}).length > 0
                            ? JSON.parse(JSON.stringify(manpowerFunctionBaseline))
                            : null,
                        twoCityDerived: (minimumManpowerConfig && minimumManpowerConfig.twoCityDerived)
                            ? JSON.parse(JSON.stringify(minimumManpowerConfig.twoCityDerived))
                            : null,
                        cityShiftSplit: (minimumManpowerConfig && minimumManpowerConfig.cityShiftSplit)
                            ? JSON.parse(JSON.stringify(minimumManpowerConfig.cityShiftSplit))
                            : null,
                        scenarioSkillDemand: (minimumManpowerConfig && minimumManpowerConfig.scenarioSkillDemand)
                            ? JSON.parse(JSON.stringify(minimumManpowerConfig.scenarioSkillDemand))
                            : null
                    }
                }
            };
            config.scheduleResultSnapshot = JSON.parse(JSON.stringify(scheduleByStaff || {}));
            config.updatedAt = new Date().toISOString();

            await this.updateGenerationJob(configId, {
                progress: 90,
                stageKey: 'persisting',
                message: '正在写入排班结果...'
            });
            await DB.saveMonthlyScheduleConfig(config);
            await Store.saveState();
            await this.refreshMonthlyViewAfterGeneration(configId);
            const solverModeMatchRequest = requestedMode === 'hybrid'
                ? (solverModeUsed === 'mip' || solverModeUsed === 'csp')
                : (solverModeUsed === requestedMode);
            updateStatus(`已生成月度班次配置（${solverModeUsed.toUpperCase()}）`, solverModeMatchRequest ? 'success' : 'warning');

            const warnings = stats.warnings || [];
            const errors = stats.errors || [];
            if (specialRestRebalance && specialRestRebalance.movedCount > 0) {
                warnings.push(`已重排特殊休息 ${specialRestRebalance.movedCount} 次（缺口 ${specialRestRebalance.beforeShortage} -> ${specialRestRebalance.afterShortage}）`);
            }
            if (specialRestRebalance && specialRestRebalance.unresolvedShortage > 0) {
                warnings.push(`特殊休息重排后仍有 ${specialRestRebalance.unresolvedShortage} 人天结构缺口，请下调最低人力或补充人力`);
            }
            if (shiftShortageRebalance && shiftShortageRebalance.movedCount > 0) {
                warnings.push(
                    shiftShortageRebalance.improved
                        ? `按缺班班别定向重排已执行 ${shiftShortageRebalance.movedCount} 次（硬约束 ${shiftShortageRebalance.beforeTotal} -> ${shiftShortageRebalance.afterTotal}）`
                        : `按缺班班别定向重排执行 ${shiftShortageRebalance.movedCount} 次，但未改善硬约束（${shiftShortageRebalance.beforeTotal} -> ${shiftShortageRebalance.afterTotal}）`
                );
            }
            if (minimumAutoRepairFlow && minimumAutoRepairFlow.applied === true) {
                warnings.push(
                    `最低人力自动修复已执行(${(minimumAutoRepairFlow.steps || []).join('，') || '无'}): 缺口下界 ${Number(minimumAutoRepairFlow.beforeLowerBoundGap || 0)} -> ${Number(minimumAutoRepairFlow.afterLowerBoundGap || 0)}`
                );
            }
            if (fallbackReason) {
                warnings.push(fallbackReason);
            }
            if (feasibilityPrecheck && feasibilityPrecheck.hasRisk) {
                warnings.push(
                    `可行性快检提示：需求${Number(feasibilityPrecheck.totalDemand || 0)}，可用${Number(feasibilityPrecheck.totalAvailableSlots || 0)}，下界缺口${Number(feasibilityPrecheck.infeasibleLowerBound || 0)}`
                );
            }
            if (missingFunctionSlots.length > 0) {
                warnings.push(`存在 ${missingFunctionSlots.length} 个白班日期未分配到具体职能`);
            }
            const hasPendingItems = (stats.hardViolations && stats.hardViolations.total > 0) || errors.length > 0 || warnings.length > 0;
            let pendingMessage = '';
            if (hasPendingItems) {
                const lines = [];
                lines.push(`算法: 请求=${requestedMode.toUpperCase()}，实际=${String(solverModeUsed || '').toUpperCase()}，strictMIP=${strictMIP ? 'ON' : 'OFF'}`);
                if (stats.hardViolations && stats.hardViolations.total > 0) {
                    lines.push(`硬约束违约: ${stats.hardViolations.total}`);
                }
                if (shiftShortageRebalance && Array.isArray(shiftShortageRebalance.attemptLogs) && shiftShortageRebalance.attemptLogs.length > 0) {
                    const progressSummary = shiftShortageRebalance.attemptLogs.slice(0, 6).map((item) => {
                        const before = (item && item.beforeHard && typeof item.beforeHard === 'object') ? item.beforeHard : {};
                        const after = (item && item.afterHard && typeof item.afterHard === 'object')
                            ? item.afterHard
                            : ((item && item.hard && typeof item.hard === 'object') ? item.hard : {});
                        const bShort = Number(before.dailyShortage || 0);
                        const bTotal = Number(before.total || 0);
                        const aShort = Number(after.dailyShortage || 0);
                        const aTotal = Number(after.total || 0);
                        const r4 = (item && item.monthlyReassign && Number(item.monthlyReassign.forcedCount || 0) > 0)
                            ? `|R=${Number(item.monthlyReassign.forcedCount || 0)}`
                            : '';
                        const picked = (bestAttempt && item.profileId === bestAttempt.profileId) ? '*' : '';
                        return `${item.profileId || '-'}${picked}:${bShort}/${bTotal}->${aShort}/${aTotal}${r4}`;
                    }).join(' | ');
                    lines.push(`重试进度(缺班/总违约): ${progressSummary}`);
                }
                if (errors.length > 0) {
                    lines.push(`错误: ${errors.slice(0, 3).join('；')}`);
                }
                if (warnings.length > 0) {
                    lines.push(`警告: ${warnings.slice(0, 5).join('；')}`);
                }
                pendingMessage = lines.join('\n');
                if (this.isViewingScheduleEntry(configId)) {
                    alert(`生成完成，但仍有待处理项：\n${pendingMessage}`);
                } else {
                    updateStatus('月度班次后台生成完成（存在待处理项），请返回月度班次配置查看详情', 'warning');
                }
            }
            const hardTotal = Number((stats.hardViolations && stats.hardViolations.total) || 0);
            await this.updateGenerationJob(configId, {
                status: 'completed',
                progress: 100,
                stageKey: 'done',
                message: hasPendingItems
                    ? `已完成，但仍有待处理项（硬约束违约 ${hardTotal}）`
                    : '已完成，硬约束已满足',
                summary: pendingMessage || null,
                solver: {
                    requestedMode,
                    usedMode: solverModeUsed,
                    strictMIP
                },
                metrics: {
                    hardTotal,
                    dailyShortage: Number((stats.hardViolations && stats.hardViolations.dailyShortage) || 0),
                    targetMismatch: Number((stats.hardViolations && stats.hardViolations.targetMismatch) || 0),
                    targetOverflow: Number((stats.hardViolations && stats.hardViolations.targetOverflow) || 0)
                }
            }, { persistNow: true });
            this.syncGenerationProgressDom(configId);
        } catch (error) {
            console.error('生成月度班次配置失败:', error);
            await this.updateGenerationJob(configId, {
                status: 'failed',
                progress: 100,
                stageKey: 'failed',
                message: `生成失败：${error.message}`,
                summary: error && error.stack ? String(error.stack).slice(0, 1200) : null
            }, { persistNow: true });
            if (this.isViewingScheduleEntry(configId)) {
                alert('生成失败：' + error.message);
            } else {
                updateStatus(`月度班次后台生成失败：${error.message}`, 'error');
            }
        }
    },

    /**
     * 获取每日技能需求（来自排班配置管理矩阵）
     * 格式: { role: { locationName: { skill: {min, max} } } }
     */
    async getDailySkillDemandFromDailyConfig() {
        const demand = {};
        const locationEntries = (() => {
            if (typeof DailyManpowerManager !== 'undefined' && Array.isArray(DailyManpowerManager.LOCATIONS) && DailyManpowerManager.LOCATIONS.length > 0) {
                return DailyManpowerManager.LOCATIONS.map((loc) => {
                    const cityCode = String(loc && loc.id ? loc.id : 'SH').toUpperCase();
                    const cityName = (typeof CityUtils !== 'undefined' && CityUtils.getCityName)
                        ? CityUtils.getCityName(cityCode, cityCode === 'CD' ? '成都' : '上海')
                        : (cityCode === 'CD' ? '成都' : '上海');
                    return { id: cityCode, name: cityName };
                });
            }
            if (typeof CityUtils !== 'undefined' && CityUtils.getAllCityCodes) {
                return CityUtils.getAllCityCodes().map((cityCode) => ({
                    id: cityCode,
                    name: CityUtils.getCityName(cityCode, cityCode === 'CD' ? '成都' : '上海')
                }));
            }
            return [{ id: 'SH', name: '上海' }, { id: 'CD', name: '成都' }];
        })();

        this.SHIFT_TYPES.forEach((role) => {
            demand[role] = {};
            locationEntries.forEach((loc) => {
                demand[role][loc.name] = {};
                this.SKILL_TYPES.forEach((skill) => {
                    demand[role][loc.name][skill] = { min: 0, max: null };
                });
            });
        });

        const buildFromMatrix = (matrix) => {
            if (!matrix) return;
            this.SHIFT_TYPES.forEach((role) => {
                this.SKILL_TYPES.forEach((skill) => {
                    locationEntries.forEach((loc) => {
                        const key = `${role}_${loc.id}_${skill}`;
                        const cell = matrix[key];
                        if (!cell) return;
                        const minVal = typeof cell.min === 'number' ? cell.min : 0;
                        const maxVal = typeof cell.max === 'number' ? cell.max : null;
                        if (demand[role] && demand[role][loc.name]) {
                            demand[role][loc.name][skill] = { min: minVal, max: maxVal };
                        }
                    });
                });
            });
        };

        if (typeof DailyManpowerManager !== 'undefined' && DailyManpowerManager.matrix) {
            buildFromMatrix(DailyManpowerManager.matrix);
            return demand;
        }
        const activeId = Store.getState('activeDailyManpowerConfigId');
        if (activeId && typeof DB !== 'undefined' && typeof DB.loadDailyManpowerConfig === 'function') {
            try {
                const config = await DB.loadDailyManpowerConfig(activeId);
                if (config && config.matrix) {
                    buildFromMatrix(config.matrix);
                }
            } catch (error) {
                console.warn('读取每日人力配置失败:', error);
            }
        }
        return demand;
    },

    /**
     * 找到人员信息（用于地点）
     */
    findStaffInfo(staffId) {
        const staffData = Store.getCurrentStaffData() || [];
        const found = staffData.find(s => (s.staffId || s.id) === staffId) || {};
        if (typeof CityUtils !== 'undefined' && CityUtils.normalizeStaffCityFields) {
            return CityUtils.normalizeStaffCityFields(found, 'SH');
        }
        return found;
    },

    /**
     * 获取某天可用人员列表（按班别与地点）
     */
    getAvailableStaffForDay(staffMeta, role, location, dayIdx, maxDays, allowOverLimit = false) {
        const list = [];
        Object.keys(staffMeta).forEach(staffId => {
            const meta = staffMeta[staffId];
            if (meta.shiftType !== role) return;
            if (meta.location !== location) return;
            if (!allowOverLimit && meta.remainingDays <= 0) return;
            if (meta.workTypes[dayIdx] === 'N') return;
            if (meta.workTypes[dayIdx] === 'D') return;
            if (meta.blocked[dayIdx]) return;
            if (this.willExceedConsecutive(meta.workTypes, dayIdx, maxDays)) return;
            list.push(staffId);
        });
        return list;
    },

    /**
     * 分配某技能的最小需求
     */
    assignSkillForDay(staffIds, staffMeta, config, dayIdx, dateStr, skill, minRequired, currentCount, maxAllowed, forceMin = false) {
        let assigned = 0;
        const candidates = staffIds.slice().sort((a, b) => {
            const ra = staffMeta[a].skillTargets[skill] - staffMeta[a].assignedSkillCounts[skill];
            const rb = staffMeta[b].skillTargets[skill] - staffMeta[b].assignedSkillCounts[skill];
            if (rb !== ra) return rb - ra;
            return (staffMeta[b].remainingDays || 0) - (staffMeta[a].remainingDays || 0);
        });
        for (let i = 0; i < candidates.length && assigned < minRequired; i++) {
            if ((currentCount + assigned) >= maxAllowed) {
                break;
            }
            const staffId = candidates[i];
            const meta = staffMeta[staffId];
            if (!forceMin && meta.assignedSkillCounts[skill] >= (meta.skillTargets[skill] + 2)) {
                continue;
            }
            meta.workTypes[dayIdx] = 'D';
            meta.remainingDays -= 1;
            meta.assignedSkillCounts[skill] += 1;
            meta.assignedDayCount += 1;
            config.staffScheduleData[staffId].dailySchedule[dateStr] = skill;
            assigned += 1;
        }
        return assigned;
    },

    /**
     * 选择最合适的技能（不超过配置上限）
     */
    pickBestSkillForStaff(meta, roleSkillWeights, dailyDemand, dailyCounts, dateStr, role, loc) {
        let bestSkill = null;
        let bestScore = -Infinity;
        this.SKILL_TYPES.forEach(skill => {
            const demand = dailyDemand[role] && dailyDemand[role][loc] ? dailyDemand[role][loc][skill] : null;
            const maxAllowed = demand && demand.max != null ? demand.max : Infinity;
            const current = (((dailyCounts[dateStr] || {})[role] || {})[loc] || {})[skill] || 0;
            if (current >= maxAllowed) {
                return;
            }
            const remainingTarget = (meta.skillTargets[skill] || 0) - (meta.assignedSkillCounts[skill] || 0);
            const weight = roleSkillWeights[role] && roleSkillWeights[role][skill] ? roleSkillWeights[role][skill] : 0;
            const score = remainingTarget * 10 + weight;
            if (score > bestScore) {
                bestScore = score;
                bestSkill = skill;
            }
        });
        return bestSkill;
    },

    /**
     * 累加每日计数
     */
    increaseDailyCount(dailyCounts, dateStr, role, loc, skill, inc) {
        if (!dailyCounts[dateStr]) dailyCounts[dateStr] = {};
        if (!dailyCounts[dateStr][role]) dailyCounts[dateStr][role] = {};
        if (!dailyCounts[dateStr][role][loc]) dailyCounts[dateStr][role][loc] = {};
        if (!dailyCounts[dateStr][role][loc][skill]) dailyCounts[dateStr][role][loc][skill] = 0;
        dailyCounts[dateStr][role][loc][skill] += inc;
    },

    /**
     * 获取大夜排班映射 { staffId: { dateStr: 'night'|'rest' } }
     */
    async getNightShiftMap() {
        const nightShiftMap = {};
        const setNightType = (staffId, dateStr, type) => {
            if (!staffId || !dateStr || !type) return;
            if (!nightShiftMap[staffId]) {
                nightShiftMap[staffId] = {};
            }

            const prev = nightShiftMap[staffId][dateStr];
            // 优先级：night > rest
            if (prev === 'night') return;
            if (type === 'night') {
                nightShiftMap[staffId][dateStr] = 'night';
                return;
            }
            if (!prev) {
                nightShiftMap[staffId][dateStr] = 'rest';
            }
        };

        const applyNightSchedule = (schedule) => {
            if (!schedule || typeof schedule !== 'object') return;
            const keys = Object.keys(schedule);
            if (keys.length === 0) return;

            const firstValue = schedule[keys[0]];
            const isDateFormat = Array.isArray(firstValue);

            if (isDateFormat) {
                // 格式1: { dateStr: [ { staffId, shiftType, isPostShiftRest } ] }
                keys.forEach(dateStr => {
                    const assignments = schedule[dateStr] || [];
                    if (!Array.isArray(assignments)) return;
                    assignments.forEach(assignment => {
                        if (!assignment || !assignment.staffId) return;
                        const shiftType = String(assignment.shiftType || '').toLowerCase();
                        const isNight = shiftType === 'night';
                        const isRest = shiftType === 'rest' || assignment.isPostShiftRest === true;
                        if (isNight) {
                            setNightType(assignment.staffId, dateStr, 'night');
                        } else if (isRest) {
                            setNightType(assignment.staffId, dateStr, 'rest');
                        }
                    });
                });
            } else {
                // 格式2: { staffId: { dateStr: 'NIGHT'|'REST'|'night'|'rest' } }
                keys.forEach(staffId => {
                    const staffSchedule = schedule[staffId];
                    if (!staffSchedule || typeof staffSchedule !== 'object') return;
                    Object.entries(staffSchedule).forEach(([dateStr, shiftValue]) => {
                        const normalized = String(shiftValue || '').toUpperCase();
                        if (!normalized) return;
                        if (normalized === 'NIGHT' || normalized === 'N') {
                            setNightType(staffId, dateStr, 'night');
                        } else if (normalized === 'REST') {
                            setNightType(staffId, dateStr, 'rest');
                        }
                    });
                });
            }
        };

        // 1) 当前会话中的大夜结果
        if (typeof NightShiftManager !== 'undefined' && NightShiftManager.currentSchedule && Object.keys(NightShiftManager.currentSchedule).length > 0) {
            applyNightSchedule(NightShiftManager.currentSchedule);
        }

        // 2) DB current 快照
        if (Object.keys(nightShiftMap).length === 0 && typeof DB !== 'undefined' && typeof DB.loadNightShiftSchedule === 'function') {
            try {
                const nightScheduleData = await DB.loadNightShiftSchedule('current');
                if (nightScheduleData && nightScheduleData.schedule) {
                    applyNightSchedule(nightScheduleData.schedule);
                }
            } catch (error) {
                console.warn('读取大夜排班失败:', error);
            }
        }

        // 3) 激活的大夜配置
        if (Object.keys(nightShiftMap).length === 0) {
            const activeNightShiftConfigId = Store.getState('activeNightShiftConfigId');
            if (activeNightShiftConfigId && typeof DB !== 'undefined' && typeof DB.loadNightShiftConfigManagement === 'function') {
                try {
                    const activeConfig = await DB.loadNightShiftConfigManagement(activeNightShiftConfigId);
                    if (activeConfig && activeConfig.schedule) {
                        applyNightSchedule(activeConfig.schedule);
                    }
                } catch (error) {
                    console.warn('读取激活的大夜配置失败:', error);
                }
            }
        }

        return nightShiftMap;
    },

    getDailyMinimumDemandForDates(dateList = []) {
        const defaults = { A1: 2, A: 2, A2: 1, B1: 2, B2: 3 };
        const config = (typeof Store !== 'undefined') ? (Store.getState('minimumManpowerConfig') || {}) : {};
        const daily = config.dailyDemand || {};
        const out = {};
        dateList.forEach((item) => {
            const dateStr = typeof item === 'string' ? item : item.dateStr;
            if (!dateStr) return;
            const row = daily[dateStr] || {};
            out[dateStr] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                const n = Number(row[shift]);
                out[dateStr][shift] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : defaults[shift];
            });
        });
        return out;
    },

    normalizePersonalRequestsForStaff(staffData = [], requests = {}) {
        const canonicalSet = new Set(
            (staffData || [])
                .map((s) => String(s.staffId || s.id || '').trim())
                .filter(Boolean)
        );
        const out = {};
        Object.keys(requests || {}).forEach((rawStaffId) => {
            const sid = String(rawStaffId || '').trim();
            if (!sid || !canonicalSet.has(sid)) return;
            const row = requests[rawStaffId];
            if (!row || typeof row !== 'object') return;
            if (!out[sid]) out[sid] = {};
            Object.keys(row).forEach((dateStr) => {
                if (!dateStr) return;
                const t = row[dateStr];
                if (!t) return;
                out[sid][dateStr] = t;
            });
        });
        return out;
    },

    normalizeNightShiftTypeMapForStaff(staffData = [], nightShiftMap = {}) {
        const canonicalSet = new Set(
            (staffData || [])
                .map((s) => String(s.staffId || s.id || '').trim())
                .filter(Boolean)
        );
        const out = {};
        Object.keys(nightShiftMap || {}).forEach((rawStaffId) => {
            const sid = String(rawStaffId || '').trim();
            if (!sid || !canonicalSet.has(sid)) return;
            const row = nightShiftMap[rawStaffId];
            if (!row || typeof row !== 'object') return;
            if (!out[sid]) out[sid] = {};
            Object.keys(row).forEach((dateStr) => {
                const t = row[dateStr];
                if (t === 'night' || t === 'rest') {
                    out[sid][dateStr] = t;
                }
            });
        });
        return out;
    },

    isBlockedRequestType(type) {
        return type === 'REQ' || type === 'REST' || type === 'ANNUAL' || type === 'LEGAL' || type === 'SICK';
    },

    buildSpecialDateFlags(dateList = []) {
        const flags = {};
        const isFixedHolidayFn = typeof HolidayManager !== 'undefined'
            ? HolidayManager.isFixedHoliday.bind(HolidayManager)
            : (typeof isFixedHoliday === 'function' ? isFixedHoliday : () => false);
        const getHolidayNameFn = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
            ? HolidayManager.getHolidayName.bind(HolidayManager)
            : null;
        const lunarHolidayFn = typeof LunarHolidays !== 'undefined' && LunarHolidays.getHoliday
            ? LunarHolidays.getHoliday.bind(LunarHolidays)
            : null;

        dateList.forEach((item) => {
            const dateStr = typeof item === 'string' ? item : item.dateStr;
            if (!dateStr) return;
            const holidayName = getHolidayNameFn ? (getHolidayNameFn(dateStr) || '') : '';
            const lunarHoliday = lunarHolidayFn ? (lunarHolidayFn(dateStr) || '') : '';
            const isSpecial = !!holidayName || !!lunarHoliday || isFixedHolidayFn(dateStr) === true;
            flags[dateStr] = isSpecial;
        });

        return flags;
    },

    rebalanceSpecialRestRequestsForCoverage(ctx = {}) {
        const {
            staffData = [],
            dateList = [],
            requests = {},
            nightShiftTypeMap = {},
            dailyDemand = {}
        } = ctx;

        const staffIds = (staffData || [])
            .map((s) => String(s.staffId || s.id || '').trim())
            .filter(Boolean);
        const dateStrings = (dateList || [])
            .map((d) => (typeof d === 'string' ? d : d.dateStr))
            .filter(Boolean);
        const dateIndexMap = {};
        dateStrings.forEach((ds, idx) => { dateIndexMap[ds] = idx; });

        const demandByDate = {};
        dateStrings.forEach((ds) => {
            const row = dailyDemand[ds] || {};
            demandByDate[ds] = this.SHIFT_TYPES.reduce((sum, shift) => {
                const n = Number(row[shift]);
                return sum + (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
            }, 0);
        });

        const req = JSON.parse(JSON.stringify(requests || {}));
        const fixedBlocked = {};
        staffIds.forEach((sid) => {
            fixedBlocked[sid] = {};
            const nightRow = nightShiftTypeMap[sid] || {};
            dateStrings.forEach((ds) => {
                const nt = nightRow[ds];
                const reqType = req[sid] && req[sid][ds];
                fixedBlocked[sid][ds] = (nt === 'night' || nt === 'rest' || reqType === 'REST');
            });
        });

        const isAvailable = (sid, ds) => {
            if (fixedBlocked[sid] && fixedBlocked[sid][ds]) return false;
            const t = req[sid] && req[sid][ds];
            return !this.isBlockedRequestType(t);
        };

        const availableByDate = {};
        dateStrings.forEach((ds) => {
            let n = 0;
            staffIds.forEach((sid) => {
                if (isAvailable(sid, ds)) n += 1;
            });
            availableByDate[ds] = n;
        });

        const specialDateFlags = this.buildSpecialDateFlags(dateStrings);
        const movedToDateCount = {};
        const moveLogs = [];
        const phaseTypesList = [['REQ'], ['ANNUAL', 'LEGAL']];

        const buildShortageRows = () => {
            const rows = [];
            dateStrings.forEach((ds) => {
                const demand = Number(demandByDate[ds] || 0);
                const available = Number(availableByDate[ds] || 0);
                const gap = Math.max(0, demand - available);
                if (gap > 0) rows.push({ dateStr: ds, demand, available, gap });
            });
            rows.sort((a, b) => {
                if (b.gap !== a.gap) return b.gap - a.gap;
                return String(a.dateStr).localeCompare(String(b.dateStr));
            });
            return rows;
        };

        const beforeRows = buildShortageRows();
        const beforeShortage = beforeRows.reduce((sum, r) => sum + r.gap, 0);
        if (beforeShortage <= 0) {
            return {
                adjustedRequests: req,
                movedCount: 0,
                beforeShortage,
                afterShortage: 0,
                unresolvedShortage: 0,
                moveLogs: []
            };
        }

        phaseTypesList.forEach((phaseTypes) => {
            let progressed = true;
            let guard = 0;
            while (progressed && guard < 4000) {
                guard += 1;
                progressed = false;
                const shortageRows = buildShortageRows();
                if (shortageRows.length === 0) break;

                for (let i = 0; i < shortageRows.length; i++) {
                    const row = shortageRows[i];
                    let need = row.gap;
                    while (need > 0) {
                        let best = null;
                        const fromDate = row.dateStr;
                        const fromIdx = Number(dateIndexMap[fromDate] || 0);

                        staffIds.forEach((sid) => {
                            const reqType = req[sid] && req[sid][fromDate];
                            if (!phaseTypes.includes(reqType)) return;
                            if (fixedBlocked[sid] && fixedBlocked[sid][fromDate]) return;

                            let bestDest = null;
                            let bestDestScore = -Infinity;

                            dateStrings.forEach((toDate) => {
                                if (toDate === fromDate) return;
                                if (fixedBlocked[sid] && fixedBlocked[sid][toDate]) return;
                                if (req[sid] && req[sid][toDate]) return;

                                const demand = Number(demandByDate[toDate] || 0);
                                const available = Number(availableByDate[toDate] || 0);
                                if ((available - 1) < demand) return;

                                const toIdx = Number(dateIndexMap[toDate] || 0);
                                const distance = Math.abs(toIdx - fromIdx);
                                const isSpecial = specialDateFlags[toDate] === true;
                                const moveLoad = Number(movedToDateCount[toDate] || 0);
                                const surplus = Math.max(0, available - demand);
                                const score =
                                    surplus * 10
                                    - moveLoad * 4
                                    - (isSpecial ? 6 : 0)
                                    - distance * 0.2;

                                if (score > bestDestScore) {
                                    bestDestScore = score;
                                    bestDest = toDate;
                                }
                            });

                            if (!bestDest) return;
                            const candidateScore = bestDestScore;
                            if (!best || candidateScore > best.score) {
                                best = {
                                    sid,
                                    type: reqType,
                                    fromDate,
                                    toDate: bestDest,
                                    score: candidateScore
                                };
                            }
                        });

                        if (!best) break;

                        if (!req[best.sid]) req[best.sid] = {};
                        delete req[best.sid][best.fromDate];
                        req[best.sid][best.toDate] = best.type;
                        availableByDate[best.fromDate] = Number(availableByDate[best.fromDate] || 0) + 1;
                        availableByDate[best.toDate] = Number(availableByDate[best.toDate] || 0) - 1;
                        movedToDateCount[best.toDate] = Number(movedToDateCount[best.toDate] || 0) + 1;
                        moveLogs.push({
                            staffId: best.sid,
                            type: best.type,
                            fromDate: best.fromDate,
                            toDate: best.toDate
                        });
                        need -= 1;
                        progressed = true;
                    }
                }
            }
        });

        const afterRows = buildShortageRows();
        const afterShortage = afterRows.reduce((sum, r) => sum + r.gap, 0);
        return {
            adjustedRequests: req,
            movedCount: moveLogs.length,
            beforeShortage,
            afterShortage,
            unresolvedShortage: afterShortage,
            moveLogs
        };
    },

    rebalanceMovableRequestsByShiftShortage(ctx = {}) {
        const {
            staffData = [],
            dateList = [],
            requests = {},
            nightShiftTypeMap = {},
            dailyDemand = {},
            monthlyShiftAssignments = {},
            shortageByDate = {},
            allowDropWithoutMove = false,
            maxDropCount = 0
        } = ctx;

        const staffIds = (staffData || [])
            .map((s) => String(s.staffId || s.id || '').trim())
            .filter(Boolean);
        const dateStrings = (dateList || [])
            .map((d) => (typeof d === 'string' ? d : d.dateStr))
            .filter(Boolean);
        const dateIndexMap = {};
        dateStrings.forEach((ds, idx) => { dateIndexMap[ds] = idx; });
        const movableTypes = new Set(['REQ', 'ANNUAL', 'LEGAL']);
        const specialDateFlags = this.buildSpecialDateFlags(dateStrings);
        const typePriority = { REQ: 3, ANNUAL: 2, LEGAL: 1 };

        const demandByDate = {};
        const demandByDateShift = {};
        dateStrings.forEach((ds) => {
            const row = dailyDemand[ds] || {};
            demandByDateShift[ds] = {};
            demandByDate[ds] = this.SHIFT_TYPES.reduce((sum, shift) => {
                const n = Number(row[shift]);
                const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
                demandByDateShift[ds][shift] = v;
                return sum + v;
            }, 0);
        });

        const req = JSON.parse(JSON.stringify(requests || {}));
        const fixedBlocked = {};
        staffIds.forEach((sid) => {
            fixedBlocked[sid] = {};
            const nightRow = nightShiftTypeMap[sid] || {};
            dateStrings.forEach((ds) => {
                const nt = nightRow[ds];
                const reqType = req[sid] && req[sid][ds];
                fixedBlocked[sid][ds] = (nt === 'night' || nt === 'rest' || reqType === 'REST');
            });
        });

        const isAvailable = (sid, ds) => {
            if (fixedBlocked[sid] && fixedBlocked[sid][ds]) return false;
            const t = req[sid] && req[sid][ds];
            return !this.isBlockedRequestType(t);
        };

        const availableByDate = {};
        dateStrings.forEach((ds) => {
            let n = 0;
            staffIds.forEach((sid) => {
                if (isAvailable(sid, ds)) n += 1;
            });
            availableByDate[ds] = n;
        });

        const shiftStaffPoolMap = {};
        this.SHIFT_TYPES.forEach((shift) => {
            shiftStaffPoolMap[shift] = Object.keys(monthlyShiftAssignments || {}).filter((sid) => {
                return monthlyShiftAssignments[sid] === shift;
            });
        });
        const shiftAvailableByDate = {};
        this.SHIFT_TYPES.forEach((shift) => {
            shiftAvailableByDate[shift] = {};
            const pool = shiftStaffPoolMap[shift] || [];
            dateStrings.forEach((ds) => {
                let n = 0;
                pool.forEach((sid) => {
                    if (isAvailable(String(sid), ds)) n += 1;
                });
                shiftAvailableByDate[shift][ds] = n;
            });
        });

        const movedToDateCount = {};
        const moveLogs = [];
        let dropCount = 0;
        const dropLimit = Math.max(0, Number(maxDropCount || 0));
        const shortageRows = [];
        Object.keys(shortageByDate || {}).forEach((fromDate) => {
            const byShift = shortageByDate[fromDate] || {};
            this.SHIFT_TYPES.forEach((shift) => {
                const g = Number(byShift[shift] || 0);
                const gap = Number.isFinite(g) ? Math.max(0, Math.floor(g)) : 0;
                if (gap <= 0) return;
                shortageRows.push({ fromDate, shift, gap });
            });
        });
        shortageRows.sort((a, b) => {
            if (b.gap !== a.gap) return b.gap - a.gap;
            return String(a.fromDate).localeCompare(String(b.fromDate));
        });

        shortageRows.forEach((row) => {
            const fromDate = row.fromDate;
            const shift = row.shift;
            const shiftStaffPool = shiftStaffPoolMap[shift] || [];
            if (shiftStaffPool.length === 0) return;

            let gap = row.gap;
            while (gap > 0) {
                let bestMove = null;
                const fromIdx = Number(dateIndexMap[fromDate] || 0);
                for (let i = 0; i < shiftStaffPool.length; i++) {
                    const sid = String(shiftStaffPool[i]);
                    if (!sid) continue;
                    const reqType = req[sid] && req[sid][fromDate];
                    if (!movableTypes.has(reqType)) continue;
                    if (fixedBlocked[sid] && fixedBlocked[sid][fromDate]) continue;

                    let bestToDate = null;
                    let bestScore = -Infinity;
                    dateStrings.forEach((toDate) => {
                        if (toDate === fromDate) return;
                        if (fixedBlocked[sid] && fixedBlocked[sid][toDate]) return;
                        if (req[sid] && req[sid][toDate]) return;

                        const demand = Number(demandByDate[toDate] || 0);
                        const available = Number(availableByDate[toDate] || 0);
                        if ((available - 1) < demand) return;

                        const shiftNeedTo = Number(demandByDateShift[toDate]?.[shift] || 0);
                        const shiftAvailTo = Number(shiftAvailableByDate[shift]?.[toDate] || 0);
                        if ((shiftAvailTo - 1) < shiftNeedTo) return;

                        const toIdx = Number(dateIndexMap[toDate] || 0);
                        const distance = Math.abs(toIdx - fromIdx);
                        const isSpecial = specialDateFlags[toDate] === true;
                        const load = Number(movedToDateCount[toDate] || 0);
                        const surplusTotal = Math.max(0, available - demand);
                        const surplusShift = Math.max(0, shiftAvailTo - shiftNeedTo);
                        const p = typePriority[reqType] || 0;
                        const score =
                            surplusShift * 20
                            + surplusTotal * 10
                            + p * 6
                            - load * 5
                            - (isSpecial ? 8 : 0)
                            - distance * 0.25;
                        if (score > bestScore) {
                            bestScore = score;
                            bestToDate = toDate;
                        }
                    });

                    if (!bestToDate) continue;
                    if (!bestMove || bestScore > bestMove.score) {
                        bestMove = {
                            sid,
                            type: reqType,
                            fromDate,
                            toDate: bestToDate,
                            shift,
                            score: bestScore
                        };
                    }
                }

                if (!bestMove) {
                    if (allowDropWithoutMove !== true || dropCount >= dropLimit) {
                        break;
                    }
                    const dropCandidates = [];
                    for (let i = 0; i < shiftStaffPool.length; i++) {
                        const sid = String(shiftStaffPool[i]);
                        if (!sid) continue;
                        const reqType = req[sid] && req[sid][fromDate];
                        if (!movableTypes.has(reqType)) continue;
                        if (fixedBlocked[sid] && fixedBlocked[sid][fromDate]) continue;
                        dropCandidates.push({
                            sid,
                            type: reqType,
                            score: (typePriority[reqType] || 0)
                        });
                    }
                    dropCandidates.sort((a, b) => {
                        if (b.score !== a.score) return b.score - a.score;
                        return String(a.sid).localeCompare(String(b.sid));
                    });
                    const pick = dropCandidates[0];
                    if (!pick) break;
                    if (!req[pick.sid]) req[pick.sid] = {};
                    delete req[pick.sid][fromDate];
                    availableByDate[fromDate] = Number(availableByDate[fromDate] || 0) + 1;
                    shiftAvailableByDate[shift][fromDate] = Number(shiftAvailableByDate[shift][fromDate] || 0) + 1;
                    moveLogs.push({
                        staffId: pick.sid,
                        shift,
                        type: pick.type,
                        fromDate,
                        toDate: null,
                        mode: 'drop'
                    });
                    dropCount += 1;
                    gap -= 1;
                    continue;
                }

                if (!req[bestMove.sid]) req[bestMove.sid] = {};
                delete req[bestMove.sid][bestMove.fromDate];
                req[bestMove.sid][bestMove.toDate] = bestMove.type;
                availableByDate[bestMove.fromDate] = Number(availableByDate[bestMove.fromDate] || 0) + 1;
                availableByDate[bestMove.toDate] = Number(availableByDate[bestMove.toDate] || 0) - 1;
                shiftAvailableByDate[bestMove.shift][bestMove.fromDate] = Number(shiftAvailableByDate[bestMove.shift][bestMove.fromDate] || 0) + 1;
                shiftAvailableByDate[bestMove.shift][bestMove.toDate] = Number(shiftAvailableByDate[bestMove.shift][bestMove.toDate] || 0) - 1;
                movedToDateCount[bestMove.toDate] = Number(movedToDateCount[bestMove.toDate] || 0) + 1;
                moveLogs.push({
                    staffId: bestMove.sid,
                    shift: bestMove.shift,
                    type: bestMove.type,
                    fromDate: bestMove.fromDate,
                    toDate: bestMove.toDate
                });
                gap -= 1;
            }
        });

        return {
            adjustedRequests: req,
            movedCount: moveLogs.length,
            dropCount,
            moveLogs
        };
    },

    buildForcedMonthlyShiftReassignPlan(ctx = {}) {
        const {
            staffData = [],
            dateList = [],
            requests = {},
            nightShiftTypeMap = {},
            dailyDemand = {},
            currentMonthlyShiftAssignments = {},
            shortageByDate = {},
            maxMoves = 0
        } = ctx;

        const staffIds = (staffData || [])
            .map((s) => String(s.staffId || s.id || '').trim())
            .filter(Boolean);
        const dateStrings = (dateList || [])
            .map((d) => (typeof d === 'string' ? d : d.dateStr))
            .filter(Boolean);
        const shortageByShift = {};
        const shortageDatesByShift = {};
        this.SHIFT_TYPES.forEach((shift) => {
            shortageByShift[shift] = 0;
            shortageDatesByShift[shift] = [];
        });

        Object.keys(shortageByDate || {}).forEach((dateStr) => {
            const row = shortageByDate[dateStr] || {};
            this.SHIFT_TYPES.forEach((shift) => {
                const g = Number(row[shift] || 0);
                const gap = Number.isFinite(g) ? Math.max(0, Math.floor(g)) : 0;
                if (gap <= 0) return;
                shortageByShift[shift] += gap;
                shortageDatesByShift[shift].push(dateStr);
            });
        });

        const totalShortage = this.SHIFT_TYPES.reduce((sum, s) => sum + Number(shortageByShift[s] || 0), 0);
        const forcedMap = {};
        const moveLogs = [];
        const hardMaxMoves = Math.max(0, Math.floor(Number(maxMoves || 0)));
        if (totalShortage <= 0 || hardMaxMoves <= 0) {
            return {
                forcedMap,
                forcedCount: 0,
                moveLogs,
                shortageByShift,
                skipped: true,
                reason: totalShortage <= 0 ? '无班别缺口，无需重分月班别' : 'maxMoves=0'
            };
        }

        const req = JSON.parse(JSON.stringify(requests || {}));
        const isBlocked = (sid, ds) => {
            const nightType = (nightShiftTypeMap[sid] || {})[ds];
            if (nightType === 'night' || nightType === 'rest') return true;
            const t = req[sid] && req[sid][ds];
            return this.isBlockedRequestType(t);
        };
        const availableOnDates = (sid, dates) => {
            let n = 0;
            (dates || []).forEach((ds) => {
                if (!isBlocked(sid, ds)) n += 1;
            });
            return n;
        };

        const assignment = {};
        staffIds.forEach((sid) => {
            const s = currentMonthlyShiftAssignments[sid];
            if (this.SHIFT_TYPES.includes(s)) assignment[sid] = s;
        });
        const assignedHeadcount = {};
        this.SHIFT_TYPES.forEach((shift) => { assignedHeadcount[shift] = 0; });
        Object.values(assignment).forEach((shift) => {
            if (assignedHeadcount[shift] != null) assignedHeadcount[shift] += 1;
        });

        const peakNeedByShift = {};
        this.SHIFT_TYPES.forEach((shift) => { peakNeedByShift[shift] = 0; });
        dateStrings.forEach((ds) => {
            const row = dailyDemand[ds] || {};
            this.SHIFT_TYPES.forEach((shift) => {
                const n = Number(row[shift] || 0);
                const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
                if (v > peakNeedByShift[shift]) peakNeedByShift[shift] = v;
            });
        });

        const movedSid = new Set();
        let remainMoves = hardMaxMoves;
        const targetShifts = this.SHIFT_TYPES
            .map((shift) => ({ shift, gap: Number(shortageByShift[shift] || 0) }))
            .filter((x) => x.gap > 0)
            .sort((a, b) => b.gap - a.gap);

        for (let tIdx = 0; tIdx < targetShifts.length && remainMoves > 0; tIdx++) {
            const targetShift = targetShifts[tIdx].shift;
            const targetGap = Number(targetShifts[tIdx].gap || 0);
            const targetDates = shortageDatesByShift[targetShift] || [];
            if (targetDates.length === 0) continue;

            let localQuota = Math.min(
                remainMoves,
                Math.max(1, Math.ceil(targetGap / 2))
            );
            while (localQuota > 0 && remainMoves > 0) {
                let best = null;
                staffIds.forEach((sid) => {
                    if (movedSid.has(sid)) return;
                    const fromShift = assignment[sid];
                    if (!fromShift || fromShift === targetShift) return;

                    const fromShiftGap = Number(shortageByShift[fromShift] || 0);
                    if (fromShiftGap > 0 && fromShiftGap >= targetGap) return;
                    const donorHeadcount = Number(assignedHeadcount[fromShift] || 0);
                    const donorPeak = Number(peakNeedByShift[fromShift] || 0);
                    const allowBorrowFromPeak = targetGap >= 3 && fromShiftGap <= 0 && donorHeadcount >= 2;
                    if (donorHeadcount <= Math.max(1, donorPeak) && !allowBorrowFromPeak) return;

                    const gain = availableOnDates(sid, targetDates);
                    if (gain <= 0) return;
                    const loss = availableOnDates(sid, shortageDatesByShift[fromShift] || []);
                    const score =
                        gain * 4
                        - loss * 3
                        - fromShiftGap * 1.5
                        + (donorHeadcount - donorPeak) * 0.8
                        + (targetGap - Number(shortageByShift[targetShift] || 0)) * 0.1;

                    if (!best || score > best.score) {
                        best = { sid, fromShift, toShift: targetShift, gain, loss, score };
                    }
                });

                if (!best) break;
                const weakMoveAllowed = targetGap >= 2 || remainMoves >= 3;
                if (best.score <= 0 && !weakMoveAllowed) break;
                forcedMap[best.sid] = best.toShift;
                movedSid.add(best.sid);
                assignedHeadcount[best.fromShift] = Math.max(0, Number(assignedHeadcount[best.fromShift] || 0) - 1);
                assignedHeadcount[best.toShift] = Number(assignedHeadcount[best.toShift] || 0) + 1;
                moveLogs.push({
                    staffId: best.sid,
                    fromShift: best.fromShift,
                    toShift: best.toShift,
                    gain: best.gain,
                    loss: best.loss,
                    score: best.score
                });
                localQuota -= 1;
                remainMoves -= 1;
            }
        }

        return {
            forcedMap,
            forcedCount: Object.keys(forcedMap).length,
            moveLogs,
            shortageByShift,
            skipped: Object.keys(forcedMap).length === 0,
            reason: Object.keys(forcedMap).length === 0 ? '未找到可提升缺班的重分班别候选人' : ''
        };
    },

    allocateIntegerByWeights(total, rawWeightMap = {}, keys = []) {
        const out = {};
        const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
        const allKeys = Array.isArray(keys) && keys.length > 0
            ? keys.map((k) => String(k))
            : Object.keys(rawWeightMap || {}).map((k) => String(k));
        allKeys.forEach((k) => { out[k] = 0; });
        if (safeTotal <= 0 || allKeys.length === 0) return out;

        const weights = {};
        let weightSum = 0;
        allKeys.forEach((k) => {
            const v = Number(rawWeightMap && rawWeightMap[k]);
            const safe = Number.isFinite(v) ? Math.max(0, v) : 0;
            weights[k] = safe;
            weightSum += safe;
        });
        if (weightSum <= 0) {
            allKeys.forEach((k) => { weights[k] = 1; });
            weightSum = allKeys.length;
        }

        let assigned = 0;
        const remainders = [];
        allKeys.forEach((k) => {
            const raw = (safeTotal * weights[k]) / Math.max(1e-9, weightSum);
            const base = Math.floor(raw);
            out[k] = base;
            assigned += base;
            remainders.push({ key: k, frac: raw - base, weight: weights[k] });
        });
        remainders.sort((a, b) => {
            if (b.frac !== a.frac) return b.frac - a.frac;
            if (b.weight !== a.weight) return b.weight - a.weight;
            return String(a.key).localeCompare(String(b.key));
        });
        let idx = 0;
        while (assigned < safeTotal && remainders.length > 0) {
            const key = remainders[idx % remainders.length].key;
            out[key] = Number(out[key] || 0) + 1;
            assigned += 1;
            idx += 1;
        }
        return out;
    },

    buildCityMonthlyShiftStrategyPlan(ctx = {}) {
        const {
            staffData = [],
            dateList = [],
            requests = {},
            nightShiftTypeMap = {},
            citySplitStrategy = 'home_city',
            cityShiftSplit = {}
        } = ctx;
        const strategy = String(citySplitStrategy || 'home_city').toLowerCase() === 'city_shift_split'
            ? 'city_shift_split'
            : 'home_city';
        const cityCodes = (typeof CityUtils !== 'undefined' && CityUtils.getAllCityCodes)
            ? CityUtils.getAllCityCodes()
            : ['SH', 'CD'];
        const cityStaff = {};
        const availabilityByStaff = {};
        cityCodes.forEach((city) => { cityStaff[city] = []; });

        const dateStrings = (dateList || [])
            .map((d) => (typeof d === 'string' ? d : d.dateStr))
            .filter(Boolean);
        const isBlocked = (staffId, dateStr) => {
            const sid = String(staffId || '').trim();
            if (!sid || !dateStr) return false;
            const nightType = String(((nightShiftTypeMap[sid] || {})[dateStr] || '')).toLowerCase();
            if (nightType === 'night' || nightType === 'rest') return true;
            const reqType = requests[sid] && requests[sid][dateStr];
            return this.isBlockedRequestType(reqType);
        };

        (staffData || []).forEach((staff) => {
            const sid = String(staff && (staff.staffId || staff.id) || '').trim();
            if (!sid) return;
            const normalized = (typeof CityUtils !== 'undefined' && CityUtils.normalizeStaffCityFields)
                ? CityUtils.normalizeStaffCityFields(staff || {}, 'SH')
                : ({
                    city: String((staff && staff.city) || '').toUpperCase() === 'CD' ? 'CD' : 'SH'
                });
            const city = cityCodes.includes(normalized.city) ? normalized.city : 'SH';
            if (!cityStaff[city]) cityStaff[city] = [];
            cityStaff[city].push(sid);
            let avail = 0;
            dateStrings.forEach((ds) => {
                if (!isBlocked(sid, ds)) avail += 1;
            });
            availabilityByStaff[sid] = avail;
        });
        cityCodes.forEach((city) => {
            cityStaff[city] = (cityStaff[city] || []).sort((a, b) => {
                const diff = Number(availabilityByStaff[b] || 0) - Number(availabilityByStaff[a] || 0);
                if (diff !== 0) return diff;
                return String(a).localeCompare(String(b));
            });
        });

        const cityTargetHeadcount = {};
        const cityAssignedHeadcount = {};
        const preferredMap = {};
        const forcedMap = {};
        cityCodes.forEach((city) => {
            cityTargetHeadcount[city] = {};
            cityAssignedHeadcount[city] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                cityTargetHeadcount[city][shift] = 0;
                cityAssignedHeadcount[city][shift] = 0;
            });
        });
        if (strategy !== 'city_shift_split') {
            return {
                strategy,
                forcedMap,
                preferredMap,
                forcedCount: 0,
                preferredCount: 0,
                cityTargetHeadcount,
                cityAssignedHeadcount
            };
        }

        const splitCfg = cityShiftSplit && typeof cityShiftSplit === 'object' ? cityShiftSplit : {};
        cityCodes.forEach((city) => {
            const staffIds = cityStaff[city] || [];
            const staffCount = staffIds.length;
            if (staffCount <= 0) return;
            const weightMap = {};
            this.SHIFT_TYPES.forEach((shift) => {
                const v = Number(splitCfg[city] && splitCfg[city][shift]);
                weightMap[shift] = Number.isFinite(v) ? Math.max(0, v) : 0;
            });
            const targetByShift = this.allocateIntegerByWeights(staffCount, weightMap, this.SHIFT_TYPES);
            cityTargetHeadcount[city] = targetByShift;

            const queue = staffIds.slice();
            const shiftOrder = this.SHIFT_TYPES.slice().sort((a, b) => {
                const ta = Number(targetByShift[a] || 0);
                const tb = Number(targetByShift[b] || 0);
                if (tb !== ta) return tb - ta;
                const wa = Number(weightMap[a] || 0);
                const wb = Number(weightMap[b] || 0);
                if (wb !== wa) return wb - wa;
                return String(a).localeCompare(String(b));
            });

            shiftOrder.forEach((shift) => {
                let need = Math.max(0, Math.floor(Number(targetByShift[shift] || 0)));
                while (need > 0 && queue.length > 0) {
                    const sid = queue.shift();
                    preferredMap[sid] = shift;
                    forcedMap[sid] = shift;
                    cityAssignedHeadcount[city][shift] = Number(cityAssignedHeadcount[city][shift] || 0) + 1;
                    need -= 1;
                }
            });

            if (queue.length > 0) {
                queue.forEach((sid) => {
                    const bestShift = this.SHIFT_TYPES.slice().sort((a, b) => {
                        const da = Number(cityTargetHeadcount[city][a] || 0) - Number(cityAssignedHeadcount[city][a] || 0);
                        const db = Number(cityTargetHeadcount[city][b] || 0) - Number(cityAssignedHeadcount[city][b] || 0);
                        if (db !== da) return db - da;
                        const wa = Number(weightMap[a] || 0);
                        const wb = Number(weightMap[b] || 0);
                        if (wb !== wa) return wb - wa;
                        return String(a).localeCompare(String(b));
                    })[0] || this.SHIFT_TYPES[0];
                    preferredMap[sid] = bestShift;
                    forcedMap[sid] = bestShift;
                    cityAssignedHeadcount[city][bestShift] = Number(cityAssignedHeadcount[city][bestShift] || 0) + 1;
                });
            }
        });

        return {
            strategy,
            forcedMap,
            preferredMap,
            forcedCount: Object.keys(forcedMap).length,
            preferredCount: Object.keys(preferredMap).length,
            cityTargetHeadcount,
            cityAssignedHeadcount
        };
    },

    buildFastFeasibilityPrecheck(ctx = {}) {
        const {
            staffData = [],
            dateList = [],
            requests = {},
            nightShiftTypeMap = {},
            dailyDemand = {},
            citySplitStrategy = 'home_city',
            cityShiftSplit = {}
        } = ctx;
        const strategy = String(citySplitStrategy || 'home_city').toLowerCase() === 'city_shift_split'
            ? 'city_shift_split'
            : 'home_city';
        const cityCodes = (typeof CityUtils !== 'undefined' && CityUtils.getAllCityCodes)
            ? CityUtils.getAllCityCodes()
            : ['SH', 'CD'];
        const dateStrings = (dateList || [])
            .map((d) => (typeof d === 'string' ? d : d.dateStr))
            .filter(Boolean);
        const staffCity = {};
        const cityStaff = {};
        cityCodes.forEach((city) => { cityStaff[city] = []; });

        (staffData || []).forEach((staff) => {
            const sid = String(staff && (staff.staffId || staff.id) || '').trim();
            if (!sid) return;
            const normalized = (typeof CityUtils !== 'undefined' && CityUtils.normalizeStaffCityFields)
                ? CityUtils.normalizeStaffCityFields(staff || {}, 'SH')
                : ({
                    city: String((staff && staff.city) || '').toUpperCase() === 'CD' ? 'CD' : 'SH'
                });
            const city = cityCodes.includes(normalized.city) ? normalized.city : 'SH';
            staffCity[sid] = city;
            if (!cityStaff[city]) cityStaff[city] = [];
            cityStaff[city].push(sid);
        });

        const isBlocked = (sid, dateStr) => {
            const nightType = String(((nightShiftTypeMap[sid] || {})[dateStr] || '')).toLowerCase();
            if (nightType === 'night' || nightType === 'rest') return true;
            const reqType = requests[sid] && requests[sid][dateStr];
            return this.isBlockedRequestType(reqType);
        };

        const dailyGapRows = [];
        let totalDemand = 0;
        let totalAvailableSlots = 0;
        let grossCapacityGap = 0;
        dateStrings.forEach((ds) => {
            const row = dailyDemand[ds] || {};
            let need = 0;
            this.SHIFT_TYPES.forEach((shift) => {
                const n = Number(row[shift]);
                need += Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
            });
            const available = Object.keys(staffCity).reduce((sum, sid) => {
                return sum + (isBlocked(sid, ds) ? 0 : 1);
            }, 0);
            const gap = Math.max(0, need - available);
            totalDemand += need;
            totalAvailableSlots += available;
            grossCapacityGap += gap;
            if (gap > 0) {
                dailyGapRows.push({ dateStr: ds, need, available, gap });
            }
        });
        dailyGapRows.sort((a, b) => {
            if (b.gap !== a.gap) return b.gap - a.gap;
            return String(a.dateStr).localeCompare(String(b.dateStr));
        });

        let cityShiftGapTotal = 0;
        const cityShiftGapRows = [];
        if (strategy === 'city_shift_split') {
            const splitCfg = cityShiftSplit && typeof cityShiftSplit === 'object' ? cityShiftSplit : {};
            dateStrings.forEach((ds) => {
                const row = dailyDemand[ds] || {};
                this.SHIFT_TYPES.forEach((shift) => {
                    const needTotal = Math.max(0, Math.floor(Number(row[shift]) || 0));
                    if (needTotal <= 0) return;
                    const cityWeights = {};
                    cityCodes.forEach((city) => {
                        const v = Number(splitCfg[city] && splitCfg[city][shift]);
                        cityWeights[city] = Number.isFinite(v) ? Math.max(0, v) : 0;
                    });
                    const needByCity = this.allocateIntegerByWeights(needTotal, cityWeights, cityCodes);
                    cityCodes.forEach((city) => {
                        const cityNeed = Math.max(0, Math.floor(Number(needByCity[city] || 0)));
                        if (cityNeed <= 0) return;
                        const available = (cityStaff[city] || []).reduce((sum, sid) => {
                            return sum + (isBlocked(sid, ds) ? 0 : 1);
                        }, 0);
                        const gap = Math.max(0, cityNeed - available);
                        if (gap <= 0) return;
                        cityShiftGapTotal += gap;
                        cityShiftGapRows.push({
                            dateStr: ds,
                            city,
                            shift,
                            need: cityNeed,
                            available,
                            gap
                        });
                    });
                });
            });
            cityShiftGapRows.sort((a, b) => {
                if (b.gap !== a.gap) return b.gap - a.gap;
                if (a.dateStr !== b.dateStr) return String(a.dateStr).localeCompare(String(b.dateStr));
                if (a.city !== b.city) return String(a.city).localeCompare(String(b.city));
                return String(a.shift).localeCompare(String(b.shift));
            });
        }

        const infeasibleLowerBound = Math.max(
            0,
            Math.max(
                Math.max(0, Math.floor(Number(totalDemand) - Number(totalAvailableSlots))),
                Math.floor(Number(cityShiftGapTotal) || 0)
            )
        );
        return {
            strategy,
            totalDemand,
            totalAvailableSlots,
            grossCapacityGap: Math.max(0, Math.floor(Number(totalDemand) - Number(totalAvailableSlots))),
            cityShiftGapTotal,
            infeasibleLowerBound,
            hasRisk: infeasibleLowerBound > 0,
            dailyGapTop: dailyGapRows.slice(0, 15),
            cityShiftGapTop: cityShiftGapRows.slice(0, 15)
        };
    },

    mergeForcedMonthlyShiftMaps(baseMap = {}, patchMap = {}) {
        const out = {};
        Object.keys(baseMap || {}).forEach((sid) => {
            const shift = String(baseMap[sid] || '').trim();
            if (!shift || !this.SHIFT_TYPES.includes(shift)) return;
            out[String(sid)] = shift;
        });
        Object.keys(patchMap || {}).forEach((sid) => {
            const shift = String(patchMap[sid] || '').trim();
            if (!shift || !this.SHIFT_TYPES.includes(shift)) return;
            out[String(sid)] = shift;
        });
        return out;
    },

    buildForcedMonthlyShiftReassignPlanByTargetPressure(ctx = {}) {
        const {
            staffData = [],
            dateList = [],
            requests = {},
            nightShiftTypeMap = {},
            dailyDemand = {},
            currentMonthlyShiftAssignments = {},
            targetDaysByStaff = {},
            maxMoves = 0
        } = ctx;

        const staffIds = (staffData || [])
            .map((s) => String(s.staffId || s.id || '').trim())
            .filter(Boolean);
        const dateStrings = (dateList || [])
            .map((d) => (typeof d === 'string' ? d : d.dateStr))
            .filter(Boolean);
        const hardMaxMoves = Math.max(0, Math.floor(Number(maxMoves || 0)));
        const forcedMap = {};
        const moveLogs = [];
        if (hardMaxMoves <= 0 || staffIds.length === 0 || dateStrings.length === 0) {
            return {
                forcedMap,
                forcedCount: 0,
                moveLogs,
                pressureByShiftBefore: {},
                pressureByShiftAfter: {},
                skipped: true,
                reason: hardMaxMoves <= 0 ? 'maxMoves=0' : '无可用人员或日期'
            };
        }

        const req = JSON.parse(JSON.stringify(requests || {}));
        const isBlocked = (sid, ds) => {
            const nightType = (nightShiftTypeMap[sid] || {})[ds];
            if (nightType === 'night' || nightType === 'rest') return true;
            const t = req[sid] && req[sid][ds];
            return this.isBlockedRequestType(t);
        };

        const demandTotalByShift = {};
        const shiftDatesByShift = {};
        this.SHIFT_TYPES.forEach((shift) => {
            demandTotalByShift[shift] = 0;
            shiftDatesByShift[shift] = [];
        });
        dateStrings.forEach((ds) => {
            const row = dailyDemand[ds] || {};
            this.SHIFT_TYPES.forEach((shift) => {
                const need = Number(row[shift] || 0);
                const v = Number.isFinite(need) ? Math.max(0, Math.floor(need)) : 0;
                if (v > 0) {
                    demandTotalByShift[shift] += v;
                    shiftDatesByShift[shift].push(ds);
                }
            });
        });

        const targetByStaff = {};
        const availableByStaff = {};
        staffIds.forEach((sid) => {
            const t = Number(targetDaysByStaff[sid]);
            let available = 0;
            dateStrings.forEach((ds) => {
                if (!isBlocked(sid, ds)) available += 1;
            });
            availableByStaff[sid] = available;
            if (Number.isFinite(t)) {
                targetByStaff[sid] = Math.max(0, Math.floor(t));
            } else {
                targetByStaff[sid] = Math.max(0, Math.floor(available));
            }
        });

        const assignment = {};
        const capacityByShift = {};
        this.SHIFT_TYPES.forEach((shift) => { capacityByShift[shift] = 0; });
        staffIds.forEach((sid) => {
            const shift = currentMonthlyShiftAssignments[sid];
            if (!this.SHIFT_TYPES.includes(shift)) return;
            assignment[sid] = shift;
            capacityByShift[shift] += Number(targetByStaff[sid] || 0);
        });

        const pressureByShiftBefore = {};
        const pressureByShiftAfter = {};
        this.SHIFT_TYPES.forEach((shift) => {
            pressureByShiftBefore[shift] = Number(demandTotalByShift[shift] || 0) - Number(capacityByShift[shift] || 0);
            pressureByShiftAfter[shift] = pressureByShiftBefore[shift];
        });

        const targetShifts = this.SHIFT_TYPES
            .map((shift) => ({ shift, pressure: Number(pressureByShiftAfter[shift] || 0) }))
            .filter((x) => x.pressure > 0)
            .sort((a, b) => b.pressure - a.pressure);
        if (targetShifts.length === 0) {
            return {
                forcedMap,
                forcedCount: 0,
                moveLogs,
                pressureByShiftBefore,
                pressureByShiftAfter,
                skipped: true,
                reason: '班别目标产能已满足需求，无需按目标压力重分班别'
            };
        }

        const movedSid = new Set();
        let remainMoves = hardMaxMoves;

        const availableOnShiftDates = (sid, shift) => {
            const dsList = shiftDatesByShift[shift] || [];
            let n = 0;
            dsList.forEach((ds) => {
                if (!isBlocked(sid, ds)) n += 1;
            });
            return n;
        };

        for (let tIdx = 0; tIdx < targetShifts.length && remainMoves > 0; tIdx++) {
            const targetShift = targetShifts[tIdx].shift;
            while (remainMoves > 0 && Number(pressureByShiftAfter[targetShift] || 0) > 0) {
                let best = null;

                staffIds.forEach((sid) => {
                    if (movedSid.has(sid)) return;
                    const fromShift = assignment[sid];
                    if (!fromShift || fromShift === targetShift) return;
                    const staffTarget = Number(targetByStaff[sid] || 0);
                    if (staffTarget <= 0) return;

                    const donorCapacityAfter = Number(capacityByShift[fromShift] || 0) - staffTarget;
                    const donorDemand = Number(demandTotalByShift[fromShift] || 0);
                    if (donorCapacityAfter < Math.max(0, donorDemand - 1)) return;

                    const targetAvail = availableOnShiftDates(sid, targetShift);
                    const donorAvail = availableOnShiftDates(sid, fromShift);
                    const targetPressure = Number(pressureByShiftAfter[targetShift] || 0);
                    const donorSlack = Math.max(0, Number(capacityByShift[fromShift] || 0) - donorDemand);
                    const donorPressure = Number(pressureByShiftAfter[fromShift] || 0);

                    const score =
                        targetPressure * 120 +
                        donorSlack * 18 +
                        targetAvail * 4 -
                        donorAvail * 2 -
                        Math.max(0, donorPressure) * 40 +
                        staffTarget * 0.8;

                    if (!best || score > best.score) {
                        best = {
                            sid,
                            fromShift,
                            toShift: targetShift,
                            staffTarget,
                            targetAvail,
                            donorAvail,
                            score
                        };
                    }
                });

                if (!best || best.score <= 0) break;

                forcedMap[best.sid] = best.toShift;
                movedSid.add(best.sid);
                assignment[best.sid] = best.toShift;
                capacityByShift[best.fromShift] = Math.max(0, Number(capacityByShift[best.fromShift] || 0) - best.staffTarget);
                capacityByShift[best.toShift] = Number(capacityByShift[best.toShift] || 0) + best.staffTarget;
                pressureByShiftAfter[best.fromShift] = Number(demandTotalByShift[best.fromShift] || 0) - Number(capacityByShift[best.fromShift] || 0);
                pressureByShiftAfter[best.toShift] = Number(demandTotalByShift[best.toShift] || 0) - Number(capacityByShift[best.toShift] || 0);
                moveLogs.push({
                    staffId: best.sid,
                    fromShift: best.fromShift,
                    toShift: best.toShift,
                    targetDays: best.staffTarget,
                    targetAvail: best.targetAvail,
                    donorAvail: best.donorAvail,
                    score: best.score
                });
                remainMoves -= 1;
            }
        }

        return {
            forcedMap,
            forcedCount: Object.keys(forcedMap).length,
            moveLogs,
            pressureByShiftBefore,
            pressureByShiftAfter,
            skipped: Object.keys(forcedMap).length === 0,
            reason: Object.keys(forcedMap).length === 0 ? '未找到可降低过量白班的重分班别候选人' : ''
        };
    },

    buildAdaptiveRetryCandidates(ctx = {}) {
        const {
            staffData = [],
            dateList = [],
            requests = {},
            nightShiftTypeMap = {},
            dailyDemand = {},
            monthlyShiftAssignments = {},
            targetDaysByStaff = {},
            shortageByDate = {},
            targetOverflow = 0,
            iteration = 1,
            strictMIP = true,
            allowDropWithoutMove = false,
            maxDropCount = 0,
            maxReassignMoves = 0
        } = ctx;

        const candidates = [];
        const shortageKeys = Object.keys(shortageByDate || {});
        const overflowGap = Math.max(0, Number(targetOverflow || 0));
        if (shortageKeys.length === 0) {
            if (overflowGap > 0) {
                const pressureShiftPlan = this.buildForcedMonthlyShiftReassignPlanByTargetPressure({
                    staffData,
                    dateList,
                    requests,
                    nightShiftTypeMap,
                    dailyDemand,
                    currentMonthlyShiftAssignments: monthlyShiftAssignments,
                    targetDaysByStaff,
                    maxMoves: Math.max(1, Math.floor(Number(maxReassignMoves || 0)))
                });
                if (pressureShiftPlan && Number(pressureShiftPlan.forcedCount || 0) > 0) {
                    candidates.push({
                        candidateId: `SHIFT_OVF_${iteration}`,
                        candidateName: '目标过量平衡-月班别重分',
                        adjustedRequests: JSON.parse(JSON.stringify(requests || {})),
                        forcedMap: JSON.parse(JSON.stringify(pressureShiftPlan.forcedMap || {})),
                        monthlyReassign: pressureShiftPlan,
                        movedCount: 0,
                        dropCount: 0,
                        moveLogs: []
                    });
                }
                candidates.push({
                    candidateId: `OVF_${iteration}`,
                    candidateName: '目标过量平衡',
                    adjustedRequests: JSON.parse(JSON.stringify(requests || {})),
                    forcedMap: {},
                    monthlyReassign: null,
                    movedCount: 0,
                    dropCount: 0,
                    moveLogs: []
                });
            }
            return candidates;
        }

        const shiftPlan = this.buildForcedMonthlyShiftReassignPlan({
            staffData,
            dateList,
            requests,
            nightShiftTypeMap,
            dailyDemand,
            currentMonthlyShiftAssignments: monthlyShiftAssignments,
            shortageByDate,
            maxMoves: Math.max(0, Number(maxReassignMoves || 0))
        });

        const requestPlan = this.rebalanceMovableRequestsByShiftShortage({
            staffData,
            dateList,
            requests,
            nightShiftTypeMap,
            dailyDemand,
            monthlyShiftAssignments,
            shortageByDate,
            allowDropWithoutMove: allowDropWithoutMove === true,
            maxDropCount
        });

        if (shiftPlan && Number(shiftPlan.forcedCount || 0) > 0) {
            candidates.push({
                candidateId: `SHIFT_${iteration}`,
                candidateName: '月班别重分',
                adjustedRequests: JSON.parse(JSON.stringify(requests || {})),
                forcedMap: JSON.parse(JSON.stringify(shiftPlan.forcedMap || {})),
                monthlyReassign: shiftPlan,
                movedCount: 0,
                dropCount: 0,
                moveLogs: []
            });
        }

        if (requestPlan && Number(requestPlan.movedCount || 0) > 0) {
            candidates.push({
                candidateId: `REQ_${iteration}`,
                candidateName: allowDropWithoutMove === true ? '休假重排+释放' : '休假重排',
                adjustedRequests: requestPlan.adjustedRequests,
                forcedMap: {},
                monthlyReassign: null,
                movedCount: Number(requestPlan.movedCount || 0),
                dropCount: Number(requestPlan.dropCount || 0),
                moveLogs: (requestPlan.moveLogs || []).slice(0, 20)
            });
        }

        if (shiftPlan && Number(shiftPlan.forcedCount || 0) > 0 && requestPlan && Number(requestPlan.movedCount || 0) > 0) {
            candidates.push({
                candidateId: `MIX_${iteration}`,
                candidateName: '月班别重分+休假重排',
                adjustedRequests: requestPlan.adjustedRequests,
                forcedMap: JSON.parse(JSON.stringify(shiftPlan.forcedMap || {})),
                monthlyReassign: shiftPlan,
                movedCount: Number(requestPlan.movedCount || 0),
                dropCount: Number(requestPlan.dropCount || 0),
                moveLogs: (requestPlan.moveLogs || []).slice(0, 20)
            });
        }

        if (strictMIP === true && iteration >= 3 && allowDropWithoutMove !== true) {
            const releasePlan = this.rebalanceMovableRequestsByShiftShortage({
                staffData,
                dateList,
                requests,
                nightShiftTypeMap,
                dailyDemand,
                monthlyShiftAssignments,
                shortageByDate,
                allowDropWithoutMove: true,
                maxDropCount: Math.max(6, Number(maxDropCount || 0))
            });
            if (releasePlan && Number(releasePlan.movedCount || 0) > 0) {
                candidates.push({
                    candidateId: `REL_${iteration}`,
                    candidateName: '休假释放重构',
                    adjustedRequests: releasePlan.adjustedRequests,
                    forcedMap: {},
                    monthlyReassign: null,
                    movedCount: Number(releasePlan.movedCount || 0),
                    dropCount: Number(releasePlan.dropCount || 0),
                    moveLogs: (releasePlan.moveLogs || []).slice(0, 20)
                });
            }
        }

        return candidates;
    },

    /**
     * 计算应上白班天数
     */
    calculateExpectedDayShiftMap(dateList, nightShiftMap) {
        const restDaysMap = {};
        dateList.forEach(d => {
            restDaysMap[d.dateStr] = Store.isRestDay(d.dateStr);
        });
        const restDayCount = Object.values(restDaysMap).filter(v => v).length;
        const totalDays = dateList.length;
        const allStaffData = Store.getCurrentStaffData() || [];
        const expectedDayShiftMap = {};

        allStaffData.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            const personalRequests = Store.getPersonalRequests ? Store.getPersonalRequests(staffId) : (Store.state.personalRequests || {})[staffId] || {};
            const safePersonalRequests = personalRequests || {};
            let annualLeaveCount = 0;
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                if (safePersonalRequests[dateStr] === 'ANNUAL' && !Store.isRestDay(dateStr)) {
                    annualLeaveCount += 1;
                }
            });
            const expected = Math.max(0, totalDays - restDayCount - annualLeaveCount);
            const nightCount = nightShiftMap[staffId] ? Object.keys(nightShiftMap[staffId]).length : 0;
            expectedDayShiftMap[staffId] = Math.max(0, expected - nightCount);
        });
        return expectedDayShiftMap;
    },

    /**
     * 从排班配置管理获取技能比例（班别-技能权重）
     */
    async getRoleSkillWeightsFromDailyConfig() {
        const weights = {};
        const buildFromMatrix = (matrix) => {
            if (!matrix) return;
            const roles = this.SHIFT_TYPES;
            roles.forEach(role => {
                weights[role] = {};
                this.SKILL_TYPES.forEach(skill => {
                    weights[role][skill] = 0;
                });
            });
            const locations = (typeof DailyManpowerManager !== 'undefined' && Array.isArray(DailyManpowerManager.LOCATIONS) && DailyManpowerManager.LOCATIONS.length > 0)
                ? DailyManpowerManager.LOCATIONS
                : [{ id: 'SH' }];
            roles.forEach(role => {
                this.SKILL_TYPES.forEach(skill => {
                    let sum = 0;
                    locations.forEach(loc => {
                        const key = `${role}_${loc.id}_${skill}`;
                        const cell = matrix[key];
                        if (cell) {
                            const val = cell.max != null ? cell.max : cell.min;
                            if (typeof val === 'number') {
                                sum += val;
                            }
                        }
                    });
                    weights[role][skill] = sum;
                });
            });
        };

        // 优先使用当前 DailyManpowerManager.matrix
        if (typeof DailyManpowerManager !== 'undefined' && DailyManpowerManager.matrix) {
            buildFromMatrix(DailyManpowerManager.matrix);
            return this.normalizeWeights(weights);
        }

        // 否则尝试从DB加载激活配置
        const activeId = Store.getState('activeDailyManpowerConfigId');
        if (activeId && typeof DB !== 'undefined' && typeof DB.loadDailyManpowerConfig === 'function') {
            try {
                const config = await DB.loadDailyManpowerConfig(activeId);
                if (config && config.matrix) {
                    buildFromMatrix(config.matrix);
                    return this.normalizeWeights(weights);
                }
            } catch (error) {
                console.warn('读取每日人力配置失败:', error);
            }
        }

        // 兜底：均等权重
        this.SHIFT_TYPES.forEach(role => {
            weights[role] = {};
            this.SKILL_TYPES.forEach(skill => {
                weights[role][skill] = 1;
            });
        });
        return this.normalizeWeights(weights);
    },

    /**
     * 归一化权重（保证每个班别的权重和为1）
     */
    normalizeWeights(weights) {
        const normalized = {};
        Object.keys(weights).forEach(role => {
            const roleWeights = weights[role] || {};
            const total = Object.values(roleWeights).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
            normalized[role] = {};
            this.SKILL_TYPES.forEach(skill => {
                if (total > 0) {
                    normalized[role][skill] = (roleWeights[skill] || 0) / total;
                } else {
                    normalized[role][skill] = 1 / this.SKILL_TYPES.length;
                }
            });
        });
        return normalized;
    },

    /**
     * 根据权重计算技能目标次数
     */
    buildSkillTargets(shiftType, totalDays, roleSkillWeights) {
        const weights = roleSkillWeights[shiftType] || {};
        const targets = {};
        const fractional = [];
        let sum = 0;

        this.SKILL_TYPES.forEach(skill => {
            const w = weights[skill] != null ? weights[skill] : 1 / this.SKILL_TYPES.length;
            const raw = totalDays * w;
            const base = Math.floor(raw);
            targets[skill] = base;
            sum += base;
            fractional.push({ skill, frac: raw - base });
        });

        let remaining = Math.max(0, totalDays - sum);
        fractional.sort((a, b) => b.frac - a.frac);
        let i = 0;
        while (remaining > 0 && fractional.length > 0) {
            const skill = fractional[i % fractional.length].skill;
            targets[skill] += 1;
            remaining -= 1;
            i += 1;
        }

        return targets;
    },

    /**
     * 按目标次数分配技能（保持均衡）
     */
    assignSkillsByTargets(totalDays, targets) {
        const result = [];
        const remaining = { ...targets };
        for (let i = 0; i < totalDays; i++) {
            let selected = null;
            let maxRemain = -1;
            Object.keys(remaining).forEach(skill => {
                if (remaining[skill] > maxRemain) {
                    maxRemain = remaining[skill];
                    selected = skill;
                }
            });
            if (selected && remaining[selected] > 0) {
                result.push(selected);
                remaining[selected] -= 1;
            } else {
                result.push('');
            }
        }
        return result;
    },

    /**
     * 判断是否超过连续上班天数
     */
    willExceedConsecutive(workTypes, index, maxDays) {
        const isWork = (t) => t === 'D' || t === 'N';
        let left = 0;
        for (let i = index - 1; i >= 0; i--) {
            if (!isWork(workTypes[i])) break;
            left += 1;
        }
        let right = 0;
        for (let i = index + 1; i < workTypes.length; i++) {
            if (!isWork(workTypes[i])) break;
            right += 1;
        }
        return (left + 1 + right) > maxDays;
    },

    /**
     * 校验并保存配置
     */
    async validateAndSaveConfig() {
        const config = this.getCurrentConfig();
        if (!config) {
            alert('未找到配置');
            return;
        }

        const invalidStaff = [];
        Object.values(config.staffScheduleData || {}).forEach(staffData => {
            if (!staffData.shiftType || !this.SHIFT_TYPES.includes(staffData.shiftType)) {
                invalidStaff.push(staffData.staffName || staffData.staffId || '未知');
            }
        });

        if (invalidStaff.length > 0) {
            alert(`以下人员班别未设置或无效：\n${invalidStaff.slice(0, 10).join('、')}${invalidStaff.length > 10 ? '...' : ''}`);
            return;
        }

        try {
            config.updatedAt = new Date().toISOString();
            await DB.saveMonthlyScheduleConfig(config);
            await Store.saveState();
            updateStatus('月度班次配置已保存', 'success');
        } catch (error) {
            console.error('保存月度班次配置失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 点击技能单元格：循环选择技能或清空
     */
    handleSkillCellClick(staffId, dateStr, event) {
        if (event) {
            event.stopPropagation();
        }

        const config = this.getCurrentConfig();
        if (!config || !config.staffScheduleData || !config.staffScheduleData[staffId]) {
            return;
        }

        const staffData = config.staffScheduleData[staffId];
        if (!staffData.dailySchedule) {
            staffData.dailySchedule = {};
        }

        if (event && event.currentTarget && event.currentTarget.getAttribute('data-locked') === 'true') {
            return;
        }

        const currentSkill = staffData.dailySchedule[dateStr] || '';
        let nextSkill = '';

        if (event && event.shiftKey) {
            nextSkill = '';
        } else if (this.SKILL_TYPES.length > 0) {
            if (!currentSkill) {
                nextSkill = this.SKILL_TYPES[0];
            } else {
                const index = this.SKILL_TYPES.indexOf(currentSkill);
                if (index === this.SKILL_TYPES.length - 1) {
                    nextSkill = '';
                } else {
                    nextSkill = this.SKILL_TYPES[index + 1];
                }
            }
        }

        if (nextSkill) {
            staffData.dailySchedule[dateStr] = nextSkill;
        } else {
            delete staffData.dailySchedule[dateStr];
        }

        config.updatedAt = new Date().toISOString();

        // 【关键修复】只更新当前单元格DOM，不重新渲染整个表格
        // 避免从大夜配置重新加载数据覆盖删除操作
        if (event && event.currentTarget) {
            const span = event.currentTarget.querySelector('[data-skill-text]');
            if (span) {
                span.textContent = nextSkill;
                // 【修复】更新单元格样式，与渲染器保持一致
                const baseClass = 'px-0.5 py-1 text-center text-xs border';
                const cellClass = nextSkill
                    ? `${baseClass} bg-blue-50 text-blue-700 border-gray-300 cursor-pointer hover:bg-blue-100`
                    : `${baseClass} bg-gray-50 text-gray-700 border-gray-300 cursor-pointer hover:bg-gray-100`;
                event.currentTarget.className = cellClass;
                event.currentTarget.title = nextSkill ? `技能：${nextSkill}（点击切换技能）` : '未设置技能（点击设置技能）';
            }
        }

        // 【修复】自动保存到数据库（异步，不阻塞UI）
        this.saveConfigAsync(config).catch(error => {
            console.error('自动保存技能配置失败:', error);
        });
    },

    /**
     * 异步保存配置（不阻塞UI）
     */
    async saveConfigAsync(config) {
        try {
            await DB.saveMonthlyScheduleConfig(config);
            await Store.saveState();
        } catch (error) {
            console.error('保存配置失败:', error);
            throw error;
        }
    },

    /**
     * 添加子页面按钮（仿照休假需求管理）
     */
    addSubPageButtons(configId) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            console.warn('scheduleTable 未找到，无法添加按钮');
            return;
        }

        // 使用 currentConfigId 如果没有传入 configId
        const actualConfigId = configId || this.currentConfigId;

        // 查找header区域
        let header = scheduleTable.querySelector('.p-4.border-b');
        if (!header) {
            // 尝试查找包含p-4和border-b类的元素
            const allDivs = scheduleTable.querySelectorAll('div');
            for (const div of allDivs) {
                const classList = div.className || '';
                if (classList.includes('p-4') && classList.includes('border-b')) {
                    header = div;
                    break;
                }
            }
        }

        if (!header) {
            console.warn('未找到header区域，延迟重试');
            setTimeout(() => {
                this.addSubPageButtons(actualConfigId);
            }, 300);
            return;
        }

        // 查找justify-between容器
        const justifyContainer = header.querySelector('.flex.items-center.justify-between');

        if (justifyContainer) {
            // 查找按钮容器
            let buttonContainer = header.querySelector('#monthlyScheduleActionButtons');

            if (!buttonContainer) {
                // 如果不存在，创建一个新的按钮容器
                buttonContainer = document.createElement('div');
                buttonContainer.className = 'flex items-center space-x-2';
                buttonContainer.id = 'monthlyScheduleActionButtons';
                justifyContainer.appendChild(buttonContainer);
            }

            // 清除可能存在的旧按钮
            const existingButtons = buttonContainer.querySelectorAll('button[data-schedule-action]');
            existingButtons.forEach(btn => btn.remove());

            // 1. 添加清空所有技能按钮
            const clearButton = document.createElement('button');
            clearButton.setAttribute('data-schedule-action', 'clear');
            clearButton.textContent = '清空所有技能';
            clearButton.className = 'px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium';
            clearButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearAllSkills(actualConfigId);
            };

            // 2. 添加保存配置按钮
            const saveButton = document.createElement('button');
            saveButton.setAttribute('data-schedule-action', 'save');
            saveButton.textContent = '保存配置';
            saveButton.className = 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium';
            saveButton.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.saveConfig(actualConfigId);
            };

            // 3. 添加返回配置列表按钮
            const backButton = document.createElement('button');
            backButton.setAttribute('data-schedule-action', 'back');
            backButton.textContent = '返回配置列表';
            backButton.className = 'px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium';
            backButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.backToConfigList();
            };

            // 按顺序添加按钮
            buttonContainer.appendChild(clearButton);
            buttonContainer.appendChild(saveButton);
            buttonContainer.appendChild(backButton);
        } else {
            console.warn('未找到justify-between容器');
        }
    },

    /**
     * 清空所有技能
     */
    async clearAllSkills(configId) {
        console.log('清空所有技能');

        const config = Store.getMonthlyScheduleConfig
            ? Store.getMonthlyScheduleConfig(configId)
            : null;

        if (!config) {
            alert('配置不存在');
            return;
        }

        // 清空所有员工的所有日期的技能
        Object.keys(config.staffScheduleData).forEach(staffId => {
            const staffData = config.staffScheduleData[staffId];
            Object.keys(staffData.dailySchedule).forEach(dateStr => {
                staffData.dailySchedule[dateStr] = '';
            });
        });

        if (typeof Store.updateMonthlyScheduleConfig === 'function') {
            Store.updateMonthlyScheduleConfig(configId, {
                staffScheduleData: config.staffScheduleData
            });
        } else {
            config.updatedAt = new Date().toISOString();
        }

        // 保存到IndexedDB
        await DB.saveMonthlyScheduleConfig(config);

        // 重新渲染表格（使用updateStaffDisplay）
        if (typeof updateStaffDisplay === 'function') {
            updateStaffDisplay();
        }

        updateStatus('已清空所有技能', 'success');
    },

    /**
     * 保存配置
     */
    async saveConfig(configId) {
        try {
            const config = Store.getMonthlyScheduleConfig
                ? Store.getMonthlyScheduleConfig(configId)
                : null;

            if (config) {
                await DB.saveMonthlyScheduleConfig(config);
                await Store.saveState();
                updateStatus('配置已保存', 'success');
            }
        } catch (error) {
            console.error('保存配置失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 更新配置名称
     */
    async updateConfigName() {
        const newNameInput = document.getElementById('monthlyScheduleConfigNameInput');
        if (!newNameInput) return;

        const newName = newNameInput.value.trim();
        if (!newName) {
            alert('配置名称不能为空');
            newNameInput.value = this.currentConfigName || '';
            return;
        }

        const config = Store.getMonthlyScheduleConfig
            ? Store.getMonthlyScheduleConfig(this.currentConfigId)
            : null;

        if (config) {
            if (typeof Store.updateMonthlyScheduleConfig === 'function') {
                Store.updateMonthlyScheduleConfig(this.currentConfigId, { name: newName });
            } else {
                config.name = newName;
                config.updatedAt = new Date().toISOString();
            }

            // 保存到IndexedDB
            await DB.saveMonthlyScheduleConfig(config);
            await Store.saveState();

            this.currentConfigName = newName;
            updateStatus('配置名称已更新', 'success');
        }
    },

    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
};

// 导出到全局
if (typeof window !== 'undefined') {
    window.MonthlyScheduleConfigManager = MonthlyScheduleConfigManager;
}
