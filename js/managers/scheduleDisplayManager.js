/**
 * 排班结果展示管理模块
 * 完全模仿个性化休假配置（vacationManager.js）的结构和功能
 */

const ScheduleDisplayManager = {
    currentView: 'configs', // 'configs' | 'scheduleList'
    currentConfigId: null,

    getSupportedLocations() {
        if (typeof CityUtils !== 'undefined' && CityUtils.getAllLocationNames) {
            return CityUtils.getAllLocationNames();
        }
        return ['上海', '成都'];
    },

    buildDefaultFilterState() {
        return {
            idFilter: '',
            nameFilter: '',
            locations: this.getSupportedLocations(),
            personTypes: ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权']
        };
    },

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

    getConfigLockKey(config) {
        if (typeof Store !== 'undefined' && Store && typeof Store.resolveConfigLockKey === 'function') {
            return Store.resolveConfigLockKey(config, { configType: 'scheduleResult' });
        }
        return null;
    },

    isConfigInActiveLock(config) {
        if (typeof Store !== 'undefined' && Store && typeof Store.isConfigInActiveLock === 'function') {
            return Store.isConfigInActiveLock(config, { configType: 'scheduleResult' });
        }
        return false;
    },

    findExistingConfigInActiveLock(excludeConfigId = null) {
        const configs = Store.getScheduleResultConfigs ? (Store.getScheduleResultConfigs() || []) : (Store.state.scheduleResultConfigs || []);
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

    getActivationChainContext(targetConfig = null, options = {}) {
        const requireMonthly = !!(options && options.requireMonthly);
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

        let activeMonthlyScheduleConfig = null;
        const activeMonthlyScheduleConfigId = Store.getState('activeMonthlyScheduleConfigId');
        if (requireMonthly || activeMonthlyScheduleConfigId) {
            activeMonthlyScheduleConfig = activeMonthlyScheduleConfigId
                ? (Store.getMonthlyScheduleConfig
                    ? Store.getMonthlyScheduleConfig(activeMonthlyScheduleConfigId)
                    : null)
                : null;
            if (requireMonthly && !activeMonthlyScheduleConfig) {
                return { ok: false, message: '请先激活一个本月排班配置' };
            }
            if (activeMonthlyScheduleConfig) {
                const monthlyInLock = typeof Store.isConfigInActiveLock === 'function'
                    ? Store.isConfigInActiveLock(activeMonthlyScheduleConfig, { configType: 'monthlySchedule' })
                    : false;
                const monthlyScope = this.normalizeCityScope(activeMonthlyScheduleConfig.cityScope);
                if (!monthlyInLock || monthlyScope !== periodScope) {
                    return {
                        ok: false,
                        message: '本月排班配置未绑定到当前激活锁，请先统一激活链路'
                    };
                }
            }
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
            activeMonthlyScheduleConfig,
            activeCityScope,
            activeYearMonth: activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig
                ? `${activeSchedulePeriodConfig.scheduleConfig.year}${String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`
                : null
        };
    },

    findExistingConfigInCurrentLock(excludeConfigId = null) {
        return this.findExistingConfigInActiveLock(excludeConfigId);
    },

    async chooseCityScope(actionLabel = '新建排班结果配置', defaultScope = 'ALL') {
        const initialScope = this.normalizeCityScope(defaultScope);
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50';
            const dialog = document.createElement('div');
            dialog.className = 'bg-white rounded-lg shadow-lg w-full max-w-md p-6';
            dialog.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-800 mb-4">${actionLabel}</h3>
                <p class="text-sm text-gray-600 mb-3">请选择城市范围并绑定到本次配置。</p>
                <select id="result-city-scope-select" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-5">
                    <option value="SH" ${initialScope === 'SH' ? 'selected' : ''}>仅上海</option>
                    <option value="CD" ${initialScope === 'CD' ? 'selected' : ''}>仅成都</option>
                    <option value="ALL" ${initialScope === 'ALL' ? 'selected' : ''}>上海+成都</option>
                </select>
                <div class="flex justify-end space-x-3">
                    <button id="result-city-scope-cancel" class="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300">取消</button>
                    <button id="result-city-scope-ok" class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">确定</button>
                </div>
            `;
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cleanup = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };
            const cancelBtn = dialog.querySelector('#result-city-scope-cancel');
            const okBtn = dialog.querySelector('#result-city-scope-ok');
            const selectEl = dialog.querySelector('#result-city-scope-select');

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

    /**
     * 显示排班结果管理页面（配置列表）
     */
    async showScheduleDisplayManagement() {
        // 检查依赖模块
        if (typeof Store === 'undefined') {
            alert('系统初始化未完成，请刷新页面重试');
            return;
        }

        this.currentView = 'configs';
        this.currentConfigId = null;

        // 更新视图状态
        Store.updateState({
            currentView: 'scheduleDisplay',
            currentSubView: 'configs',
            currentConfigId: null
        }, false);

        // 更新标题与导航高亮
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '排班结果展示';
        }

        this.updateNavigationButtons('scheduleDisplay');
        this.renderConfigList();
    },

    /**
     * 渲染配置列表
     */
    renderConfigList() {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const configs = Store.getScheduleResultConfigs();
        const activeConfigId = Store.getState('activeScheduleResultConfigId');
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
        const chainContext = this.getActivationChainContext(null, { requireMonthly: false });
        const chainCityScope = chainContext.ok
            ? this.normalizeCityScope(chainContext.activeCityScope)
            : null;
        const existingInActiveLock = chainContext.ok ? this.findExistingConfigInActiveLock() : null;
        // 列表展示全量配置；新建/导入仅对当前锁校验唯一。
        const filteredConfigs = configs;
        const canCreateOrImport = chainContext.ok && !existingInActiveLock;
        let actionHint = '新建/导入将按“城市+周期锁唯一”校验';
        if (!chainContext.ok) {
            actionHint = chainContext.message;
        } else if (existingInActiveLock) {
            actionHint = `当前激活锁已存在配置：${existingInActiveLock.name}，请先删除后再新建或导入`;
        }
        const actionHintEscaped = String(actionHint || '').replace(/"/g, '&quot;');

        let html = `
            <div class="p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">排班结果配置</h2>
                    <div class="flex space-x-3">
                        <button onclick="ScheduleDisplayManager.createNewConfig()"
                                ${canCreateOrImport ? '' : 'disabled'}
                                title="${actionHintEscaped}"
                                class="px-4 py-2 text-white rounded-md transition-colors text-sm font-medium ${canCreateOrImport ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}">
                            新建排班结果
                        </button>
                        <button onclick="ScheduleDisplayManager.importConfig()"
                                ${canCreateOrImport ? '' : 'disabled'}
                                title="${actionHintEscaped}"
                                class="px-4 py-2 text-white rounded-md transition-colors text-sm font-medium ${canCreateOrImport ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}">
                            导入排班结果
                        </button>
                    </div>
                </div>
                <div class="mb-4">
                    <p class="text-sm text-gray-600">当前排班周期: ${currentYearMonth || '未设置'}${chainCityScope ? `｜上游激活城市: ${this.getCityScopeLabel(chainCityScope)}` : ''}</p>
                </div>

                ${filteredConfigs.length === 0 ? `
                    <div class="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <h3 class="text-lg font-semibold text-gray-700 mb-2">暂无排班结果配置</h3>
                        <p class="text-gray-500 mb-4">${canCreateOrImport ? `当前激活城市为${this.getCityScopeLabel(chainCityScope)}，可创建当前锁排班结果配置` : actionHint}</p>
                        <button onclick="ScheduleDisplayManager.createNewConfig()"
                            ${canCreateOrImport ? '' : 'disabled'}
                            title="${actionHintEscaped}"
                            class="px-6 py-2 text-white rounded-lg ${canCreateOrImport ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}">
                            创建配置
                        </button>
                    </div>
                ` : `
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${filteredConfigs.map(config => {
                            const isActive = config.configId === activeConfigId;
                            const staffCount = Object.keys(config.scheduleResultSnapshot || {}).length;
                            const schedulePeriod = config.scheduleConfig ?
                                `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}` : '-';
                            const configCityScope = this.getConfigCityScope(config);
                            const cityScopeLabel = this.getCityScopeLabel(configCityScope);
                            const rowOperateAllowed = chainContext.ok && this.isConfigInActiveLock(config);
                            const rowOperateHint = rowOperateAllowed
                                ? ''
                                : (!chainContext.ok ? actionHint : '归档配置仅支持查看，不可编辑/导入/激活');
                            const rowOperateHintEscaped = String(rowOperateHint || '').replace(/"/g, '&quot;');

                            return `
                                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow
                                    ${isActive ? 'ring-2 ring-blue-500' : ''}">
                                    <div class="flex justify-between items-start mb-3">
                                        <h3 class="text-lg font-semibold text-gray-800 truncate flex-1">${this.escapeHtml(config.name)}</h3>
                                        ${isActive ? `
                                            <span class="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                                已激活
                                            </span>
                                        ` : ''}
                                    </div>
                                    <div class="space-y-2 text-sm text-gray-600 mb-4">
                                        <p class="flex items-center">
                                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                            </svg>
                                            ${schedulePeriod}
                                        </p>
                                        <p class="flex items-center">
                                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M6 3v4m12-4v4M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                            </svg>
                                            ${cityScopeLabel}
                                        </p>
                                        <p class="flex items-center">
                                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                                            </svg>
                                            已分配: ${staffCount} 人
                                        </p>
                                        <p class="flex items-center">
                                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            创建于: ${new Date(config.createdAt).toLocaleString('zh-CN')}
                                        </p>
                                    </div>
                                    <div class="flex justify-between items-center pt-3 border-t border-gray-200">
                                        <div class="flex space-x-2">
                                            <button onclick="ScheduleDisplayManager.viewConfig('${config.configId}')"
                                                title="查看"
                                                class="px-3 py-1.5 text-sm text-white rounded bg-blue-600 hover:bg-blue-700">
                                                查看
                                            </button>
                                            ${isActive ? `
                                                <button onclick="ScheduleDisplayManager.deactivateConfig()"
                                                    class="px-3 py-1.5 text-sm bg-gray-400 text-white rounded hover:bg-gray-500">
                                                    取消激活
                                                </button>
                                            ` : `
                                                <button onclick="ScheduleDisplayManager.activateConfig('${config.configId}')"
                                                    ${rowOperateAllowed ? '' : 'disabled'}
                                                    title="${rowOperateHintEscaped}"
                                                    class="px-3 py-1.5 text-sm text-white rounded ${rowOperateAllowed ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}">
                                                    激活
                                                </button>
                                            `}
                                        </div>
                                        <div class="flex space-x-1">
                                            <button onclick="ScheduleDisplayManager.duplicateConfig('${config.configId}')"
                                                ${rowOperateAllowed ? '' : 'disabled'}
                                                title="${rowOperateAllowed ? '复制' : rowOperateHintEscaped}"
                                                class="p-1.5 rounded ${rowOperateAllowed ? 'text-purple-600 hover:bg-purple-50' : 'text-gray-400 cursor-not-allowed'}">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                                </svg>
                                            </button>
                                            <button onclick="ScheduleDisplayManager.deleteConfig('${config.configId}')"
                                                class="p-1.5 text-red-600 hover:bg-red-50 rounded" title="删除">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 新建配置（从激活的月度班次配置继承数据）
     */
    async createNewConfig() {
        const chainContext = this.getActivationChainContext(null, { requireMonthly: true });
        if (!chainContext.ok) {
            alert(chainContext.message);
            return;
        }
        const activeMonthlyScheduleConfig = chainContext.activeMonthlyScheduleConfig;
        const schedulePeriodConfig = chainContext.activeSchedulePeriodConfig;

        const scheduleConfig = schedulePeriodConfig.scheduleConfig;
        const yearMonth = `${scheduleConfig.year}${String(scheduleConfig.month).padStart(2, '0')}`;
        const targetCityScope = this.normalizeCityScope(chainContext.activeCityScope);
        const existing = this.findExistingConfigInCurrentLock();
        if (existing) {
            alert(`当前激活锁已存在排班结果配置：${existing.name}。请先删除后再新建。`);
            return;
        }
        const staffScheduleData = activeMonthlyScheduleConfig.staffScheduleData || {};

        // 从激活的月度班次配置继承数据，转换为排班结果格式
        const scheduleResult = {};
        
        Object.entries(staffScheduleData).forEach(([staffId, staffData]) => {
            if (!scheduleResult[staffId]) {
                scheduleResult[staffId] = {};
            }
            
            // 复制每日排班数据（包括技能、大夜、休假等）
            const dailySchedule = staffData.dailySchedule || {};
            Object.entries(dailySchedule).forEach(([dateStr, value]) => {
                if (value) {
                    scheduleResult[staffId][dateStr] = value;
                }
            });
        });

        // 生成配置名称
        const configName = `${yearMonth}-排班结果-${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

        // 创建排班结果配置（保存完整的 staffScheduleData 结构以便后续编辑）
        const configId = Store.createScheduleResultConfig(
            configName,
            scheduleResult,
            scheduleConfig,
            targetCityScope,
            chainContext.activeSchedulePeriodConfigId
        );
        
        // 保存完整的 staffScheduleData 结构到配置中（用于编辑）
        Store.updateScheduleResultConfig(configId, {
            cityScope: targetCityScope,
            staffScheduleData: JSON.parse(JSON.stringify(staffScheduleData)),
            dayShiftReport: activeMonthlyScheduleConfig.dayShiftReport
                ? JSON.parse(JSON.stringify(activeMonthlyScheduleConfig.dayShiftReport))
                : null
        }, true);

        // 激活该配置
        await Store.setActiveScheduleResultConfig(configId);

        // 刷新列表并跳转到详情页
        this.renderConfigList();
        await this.viewConfig(configId);

        if (typeof StatusUtils !== 'undefined') {
            StatusUtils.updateStatus('排班结果配置已创建', 'success');
        }
    },

    /**
     * 生成随机排班数据
     * 规则：
     * 1. 每人有一个班别（A1、A、A2、B1、B2）
     * 2. 每人每天分配一个技能组（根据人员技能）或"大夜"或"休息"
     */
    async generateRandomSchedule() {
        const staffData = Store.getCurrentStaffData();
        const scheduleConfig = Store.getState('scheduleConfig');
        const personalRequests = Store.getAllPersonalRequests();
        const restDays = Store.getAllRestDays();

        if (!staffData || staffData.length === 0) {
            alert('请先上传人员数据');
            return {};
        }

        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            alert('请先配置排班周期');
            return {};
        }

        console.log('[ScheduleDisplayManager] 开始生成排班，使用完整算法...');

        try {
            // ============ 第1步: 基础休息需求规则（配额管理） ============
            let restQuotas = {};
            let processedPersonalRequests = { ...personalRequests };

            if (typeof BasicRestSolver !== 'undefined') {
                console.log('[ScheduleDisplayManager] 第1步: 处理休假配额管理...');
                const basicRestResult = BasicRestSolver.processBasicRestRules({
                    staffData: staffData,
                    personalRequests: personalRequests,
                    restDays: restDays,
                    scheduleConfig: scheduleConfig
                });
                processedPersonalRequests = basicRestResult.personalRequests;
                restQuotas = basicRestResult.restQuotas;
                console.log('[ScheduleDisplayManager] 休假配额计算完成');
            }

            // ============ 第2步: 夜班排班（优先） ============
            let nightShiftSchedule = {};
            let mandatoryRestDays = {}; // 夜班后必须休息的日期
            if (typeof NightShiftSolver !== 'undefined') {
                console.log('[ScheduleDisplayManager] 第2步: 生成夜班排班（优先）...');
                const nightShiftRules = typeof NightShiftRules !== 'undefined' ? NightShiftRules.getRules() : null;
                const nightShiftResult = await NightShiftSolver.generateNightShiftSchedule({
                    staffData: staffData,
                    scheduleConfig: scheduleConfig,
                    personalRequests: processedPersonalRequests,
                    restDays: restDays,
                    rules: nightShiftRules
                });
                nightShiftSchedule = nightShiftResult.schedule;
                mandatoryRestDays = nightShiftResult.mandatoryRestDays || {};
                console.log('[ScheduleDisplayManager] 夜班排班完成，总夜班数:', nightShiftResult.stats.totalNightShifts);
            }

            // ============ 第3步: 休息排班（基于夜班结果） ============
            let additionalRestDays = {};
            if (typeof BasicRestSolver !== 'undefined' && Object.keys(restQuotas).length > 0) {
                console.log('[ScheduleDisplayManager] 第3步: 生成休息排班（基于夜班结果）...');

                // 夜班排班结果作为 currentSchedule
                additionalRestDays = BasicRestSolver.calculateRemainingRestDays({
                    staffData: staffData,
                    scheduleConfig: scheduleConfig,
                    restQuotas: restQuotas,
                    currentSchedule: nightShiftSchedule,
                    restDays: restDays,
                    mandatoryRestDays: mandatoryRestDays
                });

                console.log('[ScheduleDisplayManager] 休息排班完成');
            }

            // ============ 第4步: 白班排班（排除夜班和休息日） ============
            let dayShiftSchedule = {};
            let dayShiftStats = null;
            let dayShiftMeta = null;
            if (typeof CSPSolver !== 'undefined') {
                console.log('[ScheduleDisplayManager] 第4步: 生成白班排班（排除夜班和休息日）...');

                // 合并夜班后的必须休息日和补充的休息日
                const allRestDays = { ...processedPersonalRequests };
                Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
                    if (!allRestDays[staffId]) allRestDays[staffId] = {};
                    dates.forEach(dateStr => {
                        allRestDays[staffId][dateStr] = 'REST';
                    });
                });
                Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
                    if (!allRestDays[staffId]) allRestDays[staffId] = {};
                    dates.forEach(dateStr => {
                        allRestDays[staffId][dateStr] = 'REST';
                    });
                });

                const dayShiftRules = typeof DayShiftRules !== 'undefined' ? DayShiftRules.getRules() : {};
                const dayShiftResult = await CSPSolver.generateDayShiftSchedule({
                    staffData: staffData,
                    scheduleConfig: scheduleConfig,
                    personalRequests: allRestDays,
                    restDays: restDays,
                    nightSchedule: nightShiftSchedule,
                    rules: dayShiftRules
                });
                dayShiftSchedule = dayShiftResult.schedule;
                dayShiftStats = dayShiftResult.stats || null;
                dayShiftMeta = dayShiftResult.meta || null;
                console.log('[ScheduleDisplayManager] 白班排班完成，总分配数:', dayShiftResult.stats.totalAssignments);
            } else {
                console.error('[ScheduleDisplayManager] CSPSolver 未加载');
                alert('白班排班算法模块未加载');
                return {};
            }

            // ============ 第5步: 整合最终排班结果 ============
            const scheduleResult = {};

            // 5.1 个性化休假需求（REQ）
            Object.entries(processedPersonalRequests).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                Object.entries(dates).forEach(([dateStr, status]) => {
                    if (status === 'REQ') scheduleResult[staffId][dateStr] = 'REST';
                });
            });

            // 5.2 夜班排班
            Object.entries(nightShiftSchedule).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                Object.entries(dates).forEach(([dateStr, shift]) => {
                    if (shift && !scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = 'NIGHT';
                    }
                });
            });

            // 5.3 夜班后的必须休息日
            Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                dates.forEach(dateStr => {
                    if (!scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = 'REST';
                    }
                });
            });

            // 5.4 补充的休息日
            Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                dates.forEach(dateStr => {
                    if (!scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = 'REST';
                    }
                });
            });

            // 5.5 白班排班
            Object.entries(dayShiftSchedule).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                Object.entries(dates).forEach(([dateStr, shift]) => {
                    if (shift && !scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = shift;
                    }
                });
            });

            console.log('[ScheduleDisplayManager] 排班生成完成，包含人员数:', Object.keys(scheduleResult).length);
            return {
                scheduleResult,
                dayShiftStats,
                dayShiftMeta,
                nightShiftSchedule,
                mandatoryRestDays,
                additionalRestDays
            };

        } catch (error) {
            console.error('[ScheduleDisplayManager] 生成排班失败:', error);
            alert('生成排班失败：' + error.message);
            return {
                scheduleResult: {},
                dayShiftStats: null,
                dayShiftMeta: null,
                nightShiftSchedule: {},
                mandatoryRestDays: {},
                additionalRestDays: {}
            };
        }
    },

    /**
     * 导入配置（从当前finalSchedule）
     */
    async importConfig() {
        const finalSchedule = Store.getState('finalSchedule');
        const scheduleConfig = Store.getState('scheduleConfig');

        if (!finalSchedule || Object.keys(finalSchedule).length === 0) {
            alert('请先生成排班');
            return;
        }

        const chainContext = this.getActivationChainContext(null, { requireMonthly: false });
        if (!chainContext.ok) {
            alert(chainContext.message);
            return;
        }
        const targetCityScope = this.normalizeCityScope(chainContext.activeCityScope);
        const yearMonth = `${scheduleConfig.year}${String(scheduleConfig.month).padStart(2, '0')}`;
        const existing = this.findExistingConfigInCurrentLock();
        if (existing) {
            alert(`当前激活锁已存在排班结果配置：${existing.name}。请先删除后再导入。`);
            return;
        }

        const configName = `${yearMonth}-排班结果-${new Date().getTime()}`;
        const configId = Store.createScheduleResultConfig(
            configName,
            finalSchedule,
            scheduleConfig,
            targetCityScope,
            chainContext.activeSchedulePeriodConfigId
        );
        Store.updateScheduleResultConfig(configId, { cityScope: targetCityScope }, true);

        await Store.setActiveScheduleResultConfig(configId);
        this.renderConfigList();

        if (typeof StatusUtils !== 'undefined') {
            StatusUtils.updateStatus('排班结果已导入', 'success');
        }
    },

    /**
     * 激活配置
     */
    async activateConfig(configId) {
        try {
            const config = Store.getScheduleResultConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }
            const chainContext = this.getActivationChainContext(config, { requireMonthly: false });
            if (!chainContext.ok) {
                alert(chainContext.message);
                return;
            }
            await Store.setActiveScheduleResultConfig(configId);
            this.renderConfigList();

            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('排班结果配置已激活', 'success');
            }
        } catch (error) {
            alert('激活失败：' + error.message);
        }
    },

    /**
     * 查看配置（显示排班表格详情页）
     */
    async viewConfig(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }
        this.detailReadOnly = !this.isConfigInActiveLock(config);

        this.currentView = 'scheduleDetail';
        this.currentConfigId = configId;

        Store.updateState({
            currentSubView: 'scheduleDetail',
            currentConfigId: configId
        }, false);

        await this.renderScheduleDetail(config);
    },

    /**
     * 渲染排班详情页（包含配置参数、筛选、表格、报表）
     */
    async renderScheduleDetail(config) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;
        const lockReadOnlyNotice = this.detailReadOnly
            ? '<p class="text-xs text-amber-700 mt-1">归档只读视图：该配置不属于当前激活锁，仅支持查看。</p>'
            : '';

        const scheduleResult = config.scheduleResultSnapshot || {};
        const scheduleConfig = config.scheduleConfig;
        const staffData = Store.getCurrentStaffData();

        // 直接引用激活的本月排班配置（包含每日排班数据）
        const activeMonthlyScheduleConfig = Store.getActiveMonthlyScheduleConfig();
        const monthlyShifts = {}; // 班别数据
        const monthlyDailySchedule = {}; // 每日排班数据
        
        if (activeMonthlyScheduleConfig && activeMonthlyScheduleConfig.staffScheduleData) {
            Object.entries(activeMonthlyScheduleConfig.staffScheduleData).forEach(([staffId, staffData]) => {
                if (staffData.shiftType) {
                    monthlyShifts[staffId] = staffData.shiftType;
                }
                if (staffData.dailySchedule) {
                    monthlyDailySchedule[staffId] = staffData.dailySchedule;
                }
            });
        }

        // 获取排班周期和日期列表
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            scheduleTable.innerHTML = '<div class="p-8 text-center text-gray-400">请先配置排班周期</div>';
            return;
        }

        // 检查必要的函数
        if (typeof generateDateList === 'undefined') {
            scheduleTable.innerHTML = '<div class="p-8 text-center text-red-600">系统函数未加载，请刷新页面重试</div>';
            return;
        }

        const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const allRestDays = Store.getAllRestDays();

        // 筛选状态（初始化为空）
        if (!this.filterState) {
            this.filterState = this.buildDefaultFilterState();
        }

        // 获取 staffScheduleData（如果存在，用于编辑）
        let staffScheduleData = {};
        if (config.staffScheduleData) {
            staffScheduleData = config.staffScheduleData;
        } else {
            // 优先从当前排班结果快照重建（保证算法结果可视化）
            if (scheduleResult && Object.keys(scheduleResult).length > 0) {
                staffScheduleData = this.buildStaffScheduleDataFromResult(
                    scheduleResult,
                    staffData || [],
                    (config.dayShiftReport && config.dayShiftReport.stats) ? config.dayShiftReport.stats : {}
                );
            } else {
                // 无快照时再从激活的月度班次配置继承
                const activeMonthlyScheduleConfigForData = Store.getActiveMonthlyScheduleConfig();
                if (activeMonthlyScheduleConfigForData && activeMonthlyScheduleConfigForData.staffScheduleData) {
                    staffScheduleData = JSON.parse(JSON.stringify(activeMonthlyScheduleConfigForData.staffScheduleData));
                }
            }

            // 保存回当前配置
            Store.updateScheduleResultConfig(config.configId, {
                staffScheduleData: staffScheduleData
            }, true);
        }

        // 应用筛选
        const filteredStaff = this.applyFilter(staffData || []);
        const allLocations = this.getSupportedLocations();
        const locationDisplayValue = (this.filterState.locations || []).length >= allLocations.length
            ? '全部'
            : ((this.filterState.locations || []).join(', ') || '全部');

        let html = `
            <div class="p-4 border-b border-gray-200 bg-white">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <h2 class="text-lg font-bold text-gray-800">排班展示</h2>
                        <span class="text-sm text-gray-500">-</span>
                        <input type="text"
                               id="scheduleDisplayConfigNameInput"
                               value="${this.escapeHtml(config.name)}"
                               class="text-sm text-gray-500 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                               style="width: 40ch;"
                               placeholder="输入配置名称"
                               onblur="ScheduleDisplayManager.updateConfigName()"
                               onkeypress="if(event.key === 'Enter') { this.blur(); }">
                    </div>
                    <div class="flex items-center space-x-2" id="scheduleDisplayActionButtons">
                        <button onclick="ScheduleDisplayManager.openConfigParams()"
                            class="px-3 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 transition-colors text-sm font-medium">
                            配置参数
                        </button>
                        <button onclick="ScheduleDisplayManager.clearAllSkillsAndShifts('${config.configId}')"
                            class="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            重置技能与班别
                        </button>
                        <button onclick="ScheduleDisplayManager.generateScheduleDisplay('${config.configId}')"
                            class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            生成排班展示
                        </button>
                        <button onclick="ScheduleDisplayManager.validateAndSave('${config.configId}')"
                            class="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium">
                            校验并保存
                        </button>
                        <button onclick="ScheduleDisplayManager.backToConfigList()"
                            class="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                            返回配置列表
                        </button>
                    </div>
                </div>

                ${this.renderDayShiftSummaryCard(config)}

                <!-- 筛选区域 -->
                <div class="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-200">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">ID（模糊/精准匹配）</label>
                            <input type="text" id="scheduleDetailIdFilter"
                                   value="${this.filterState.idFilter || ''}"
                                   placeholder="输入ID进行筛选"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                                   onblur="ScheduleDisplayManager.updateFilter()">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">姓名（模糊/精准匹配）</label>
                            <input type="text" id="scheduleDetailNameFilter"
                                   value="${this.filterState.nameFilter || ''}"
                                   placeholder="输入姓名进行筛选"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                                   onblur="ScheduleDisplayManager.updateFilter()">
                        </div>
                        <div class="relative">
                            <label class="block text-xs font-medium text-gray-700 mb-1">归属地</label>
                            <div class="relative">
                                <input type="text" id="scheduleDetailLocationDisplay"
                                       readonly disabled
                                       value="${locationDisplayValue}"
                                       placeholder="归属地"
                                       class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-gray-100 cursor-not-allowed">
                            </div>
                        </div>
                        <div class="relative">
                            <label class="block text-xs font-medium text-gray-700 mb-1">人员类型（多选）</label>
                            <div class="relative">
                                <input type="text" id="scheduleDetailPersonTypeDisplay"
                                       readonly
                                       value="${(this.filterState.personTypes && this.filterState.personTypes.length === 4) ? '全部' : (this.filterState.personTypes || []).join(', ')}"
                                       placeholder="点击选择人员类型"
                                       class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white cursor-pointer"
                                       onclick="ScheduleDisplayManager.togglePersonTypeFilterDropdown()">
                                <div id="scheduleDetailPersonTypeDropdown" class="hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg" style="max-height: 150px; overflow-y: auto;">
                                    <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                        <input type="checkbox" id="scheduleDetailFilterPersonTypeAll"
                                               ${this.filterState.personTypes && this.filterState.personTypes.length === 4 ? 'checked' : ''}
                                               onchange="ScheduleDisplayManager.togglePersonTypeFilterAll(this)"
                                               class="mr-2">
                                        <span class="text-xs">全部</span>
                                    </label>
                                    <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                        <input type="checkbox" id="scheduleDetailFilterPersonType1"
                                               ${this.filterState.personTypes && this.filterState.personTypes.includes('全人力侦测') ? 'checked' : ''}
                                               onchange="ScheduleDisplayManager.updatePersonTypeFilter()"
                                               class="mr-2">
                                        <span class="text-xs">全人力侦测</span>
                                    </label>
                                    <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                        <input type="checkbox" id="scheduleDetailFilterPersonType2"
                                               ${this.filterState.personTypes && this.filterState.personTypes.includes('半人力授权+侦测') ? 'checked' : ''}
                                               onchange="ScheduleDisplayManager.updatePersonTypeFilter()"
                                               class="mr-2">
                                        <span class="text-xs">半人力授权+侦测</span>
                                    </label>
                                    <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                        <input type="checkbox" id="scheduleDetailFilterPersonType3"
                                               ${this.filterState.personTypes && this.filterState.personTypes.includes('全人力授权+大夜侦测') ? 'checked' : ''}
                                               onchange="ScheduleDisplayManager.updatePersonTypeFilter()"
                                               class="mr-2">
                                        <span class="text-xs">全人力授权+大夜侦测</span>
                                    </label>
                                    <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                        <input type="checkbox" id="scheduleDetailFilterPersonType4"
                                               ${this.filterState.personTypes && this.filterState.personTypes.includes('授权人员支援侦测+大夜授权') ? 'checked' : ''}
                                               onchange="ScheduleDisplayManager.updatePersonTypeFilter()"
                                               class="mr-2">
                                        <span class="text-xs">授权人员支援侦测+大夜授权</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <p class="text-sm text-gray-600">共 ${filteredStaff.length} / ${staffData.length} 条有效人员记录，${dateList.length} 天排班周期</p>
                ${lockReadOnlyNotice}
            </div>

            <!-- 第三排：表格（引用月度班次配置，空余格子填充休息日） -->
            <div class="bg-white rounded-lg shadow-sm overflow-hidden">
                ${this.renderScheduleDetailTable(config, dateList, staffData, scheduleResult, monthlyShifts, monthlyDailySchedule, allRestDays, staffScheduleData)}
            </div>

            ${this.renderDayShiftDetailedReport(config)}
        `;

        scheduleTable.innerHTML = html;
        if (this.detailReadOnly) {
            const actionButtons = scheduleTable.querySelectorAll('#scheduleDisplayActionButtons button');
            actionButtons.forEach((button) => {
                if (!button || typeof button.getAttribute !== 'function') return;
                const onclick = String(button.getAttribute('onclick') || '');
                if (onclick.includes('backToConfigList')) return;
                button.disabled = true;
                button.classList.add('opacity-50', 'cursor-not-allowed');
                button.title = '归档只读配置不可编辑';
            });
        }
    },

    /**
     * 渲染排班详情表格
     */
    renderScheduleDetailTable(config, dateList, staffData, scheduleResult, monthlyShifts, monthlyDailySchedule, allRestDays, staffScheduleData) {
        // 应用筛选
        const filteredStaff = this.applyFilter(staffData);
        
        // 如果没有传入 staffScheduleData，从 config 获取
        if (!staffScheduleData) {
            staffScheduleData = config.staffScheduleData || {};
        }
        
        // 排班类型选项
        const SCHEDULE_OPTIONS = ['', 'A1', 'A', 'A2', 'B1', 'B2', '追', '收', '综', '银B', '毛', '星', '网', '天', '微', '大夜', '休息', '法定休假', '年休假', '大夜后休整'];
        const SHIFT_TYPES = ['A1', 'A', 'A2', 'B1', 'B2'];

        let html = `
            <div class="overflow-x-auto" style="max-height: 600px;">
                <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: fixed;">
                    <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                        <tr>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 40px;">状态</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 60px;">ID</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 70px;">姓名</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="width: 80px;">归属地</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="width: 100px;">人员类型</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-purple-100" style="width: 60px;">班别</th>
        `;

        // 生成日期表头
        dateList.forEach(dateInfo => {
            const holidayName = dateInfo.holidayName || '';
            const isWeekend = dateInfo.isWeekend;
            const isHoliday = dateInfo.isHoliday;
            const bgColor = isHoliday ? 'bg-red-100' : isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
            const textColor = isHoliday ? 'text-red-700' : isWeekend ? 'text-yellow-700' : 'text-gray-700';
            const borderColor = isHoliday ? 'border-red-300' : isWeekend ? 'border-yellow-200' : 'border-gray-300';

            let titleText = dateInfo.dateStr;
            if (holidayName) titleText += ` - ${holidayName}`;
            if (isWeekend && !isHoliday) titleText += ' (周末)';

            html += `
                <th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}"
                    style="width: 30px; min-width: 30px;"
                    title="${titleText}">
                    <div class="text-xs font-bold">${dateInfo.day}</div>
                    <div class="text-xs">${dateInfo.weekday}</div>
                    ${holidayName ? `<div class="text-[10px] text-red-600 font-semibold mt-0.5">${holidayName}</div>` : ''}
                </th>
            `;
        });

        html += `
                        </tr>
                        <!-- 法定休息日行 -->
                        <tr class="bg-blue-50 font-semibold" style="position: sticky; top: 0; z-index: 19;">
                            <td class="px-1 py-1 text-center text-xs text-gray-700 border border-gray-300" colspan="6">班别配置</td>
        `;

        // 法定休息日行
        dateList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const isRestDay = allRestDays[dateStr] === true;
            const restDayClass = isRestDay ? 'bg-blue-400 text-white' : 'bg-gray-50 text-gray-800';

            html += `
                <td class="px-0.5 py-1 text-center text-xs border border-gray-300 cursor-not-allowed ${restDayClass} font-semibold"
                    title="${isRestDay ? '休息日' : '工作日'}">
                    ${isRestDay ? '休' : '班'}
                </td>
            `;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // 生成人员行
        filteredStaff.forEach((staff, index) => {
            const staffId = staff.staffId || staff.id;
            const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            const assignments = scheduleResult[staffId] || {};
            const shiftType = monthlyShifts[staffId] || '-';

            html += `
                <tr class="${rowClass}" data-staff-id="${staffId}">
                    <td class="px-1 py-1 text-center border border-gray-300 align-middle">
                        <span class="inline-block w-4 h-4"></span>
                    </td>
                    <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.id}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-green-700 border border-gray-300 bg-green-50">${staff.location || '未知'}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-blue-700 border border-gray-300 bg-blue-50">${staff.personType || '未设置'}</td>
                    <td class="px-1 py-1 text-center text-xs border border-gray-300 bg-purple-50" style="width: 60px;">
                        <select class="border border-gray-300 rounded px-1 py-0.5 text-xs w-full bg-white hover:bg-gray-50 cursor-pointer"
                                onmousedown="event.stopPropagation()"
                                onclick="event.stopPropagation()"
                                onchange="ScheduleDisplayManager.updateShiftType('${config.configId}', '${staffId}', this.value)">
                            <option value="">未设置</option>
                            ${SHIFT_TYPES.map(type => `
                                <option value="${type}" ${shiftType === type ? 'selected' : ''}>${type}</option>
                            `).join('')}
                        </select>
                    </td>
            `;

            // 生成每日排班（使用下拉框可编辑）
            const staffSchedule = staffScheduleData[staffId] || {};
            const staffDailySchedule = staffSchedule.dailySchedule || monthlyDailySchedule[staffId] || {};
            
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const currentValue = staffDailySchedule[dateStr] || assignments[dateStr] || '';
                const isRestDay = allRestDays[dateStr] === true;
                const isWeekend = dateInfo.isWeekend;

                // 确定单元格背景色
                let cellBgClass = '';
                if (isRestDay) {
                    cellBgClass = 'bg-blue-100';
                } else if (isWeekend) {
                    cellBgClass = 'bg-yellow-50';
                }

                // 使用下拉框让单元格可编辑
                html += `
                    <td class="px-0.5 py-1 text-center border border-gray-300 ${cellBgClass}" style="width: 30px;">
                        <select class="border border-gray-300 rounded px-0.5 py-0.5 text-xs w-full bg-white hover:bg-gray-50 cursor-pointer"
                                onmousedown="event.stopPropagation()"
                                onclick="event.stopPropagation()"
                                onchange="ScheduleDisplayManager.updateScheduleCell('${config.configId}', '${staffId}', '${dateStr}', this.value)"
                                style="font-size: 10px; padding: 2px;">
                            <option value="">-</option>
                            ${SCHEDULE_OPTIONS.filter(opt => opt !== '').map(opt => `
                                <option value="${opt}" ${currentValue === opt ? 'selected' : ''}>${opt}</option>
                            `).join('')}
                        </select>
                    </td>
                `;
            });

            html += `
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    },

    /**
     * 应用筛选（与月度班次配置一致）
     */
    applyFilter(staffData) {
        if (!staffData || !Array.isArray(staffData)) {
            return [];
        }

        if (!this.filterState) {
            this.filterState = this.buildDefaultFilterState();
        }

        return staffData.filter(staff => {
            // ID筛选
            if (this.filterState.idFilter) {
                const staffId = (staff.staffId || staff.id || '').toString();
                if (!staffId.includes(this.filterState.idFilter)) return false;
            }

            // 姓名筛选
            if (this.filterState.nameFilter) {
                const name = (staff.name || '').toString();
                if (!name.includes(this.filterState.nameFilter)) return false;
            }

            // 归属地筛选（默认全选）
            const allLocations = this.getSupportedLocations();
            const selectedLocations = Array.isArray(this.filterState.locations) ? this.filterState.locations : [];
            if (selectedLocations.length > 0 && selectedLocations.length < allLocations.length) {
                const location = staff.location || '';
                if (!selectedLocations.includes(location)) return false;
            }

            // 人员类型筛选（与月度班次配置一致）
            if (this.filterState.personTypes && this.filterState.personTypes.length > 0) {
                const personType = staff.personType || '';
                // 检查人员类型是否匹配（支持多选）
                const matches = this.filterState.personTypes.some(type => {
                    if (type === '全人力侦测') return personType === '全人力侦测';
                    if (type === '半人力授权+侦测') return personType === '半人力授权+侦测';
                    if (type === '全人力授权+大夜侦测') return personType === '全人力授权+大夜侦测';
                    if (type === '授权人员支援侦测+大夜授权') return personType === '授权人员支援侦测+大夜授权';
                    return false;
                });
                if (!matches) return false;
            }

            return true;
        });
    },

    /**
     * 更新筛选
     */
    updateFilter() {
        if (!this.filterState) {
            this.filterState = this.buildDefaultFilterState();
        }

        this.filterState.idFilter = document.getElementById('scheduleDetailIdFilter')?.value || '';
        this.filterState.nameFilter = document.getElementById('scheduleDetailNameFilter')?.value || '';

        const config = Store.getScheduleResultConfig(this.currentConfigId);
        if (config) {
            this.renderScheduleDetail(config);
        }
    },

    /**
     * 更新归属地筛选
     */
    updateLocationFilter(location) {
        if (!this.filterState) {
            this.filterState = this.buildDefaultFilterState();
        }

        const index = this.filterState.locations.indexOf(location);
        if (index > -1) {
            this.filterState.locations.splice(index, 1);
        } else {
            this.filterState.locations.push(location);
        }

        const config = Store.getScheduleResultConfig(this.currentConfigId);
        if (config) {
            this.renderScheduleDetail(config);
        }
    },

    /**
     * 更新人员类型筛选
     */
    updatePersonTypeFilter(personType) {
        if (!this.filterState) {
            this.filterState = this.buildDefaultFilterState();
        }

        const index = this.filterState.personTypes.indexOf(personType);
        if (index > -1) {
            this.filterState.personTypes.splice(index, 1);
        } else {
            this.filterState.personTypes.push(personType);
        }

        const config = Store.getScheduleResultConfig(this.currentConfigId);
        if (config) {
            this.renderScheduleDetail(config);
        }
    },

    /**
     * 打开配置参数
     */
    openConfigParams() {
        alert('配置参数功能待后续实现');
    },

    /**
     * 重置技能与班别
     */
    async clearAllSkillsAndShifts(configId) {
        if (!confirm('确定要清空所有技能与班别吗？此操作不可恢复。')) {
            return;
        }

        try {
            const config = Store.getScheduleResultConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }

            const staffScheduleData = config.staffScheduleData || {};
            Object.values(staffScheduleData).forEach(staffData => {
                if (staffData.shiftType) {
                    staffData.shiftType = '';
                }
                if (staffData.dailySchedule) {
                    staffData.dailySchedule = {};
                }
            });

            Store.updateScheduleResultConfig(configId, {
                staffScheduleData: staffScheduleData,
                updatedAt: new Date().toISOString()
            }, true);

            // 重新渲染
            await this.viewConfig(configId);
            alert('已清空所有技能与班别');
        } catch (error) {
            console.error('清空失败:', error);
            alert('清空失败: ' + error.message);
        }
    },

    /**
     * 生成排班展示（从激活的月度班次配置继承）
     */
    async generateScheduleDisplay(configId) {
        try {
            const config = Store.getScheduleResultConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }

            const activeMonthlyConfig = Store.getActiveMonthlyScheduleConfig();
            if (!activeMonthlyConfig) {
                alert('请先激活并生成月度班次配置');
                return;
            }

            const sourceStaffSchedule = activeMonthlyConfig.staffScheduleData || {};
            const nextStaffScheduleData = JSON.parse(JSON.stringify(sourceStaffSchedule));
            const scheduleResultSnapshot = {};

            Object.entries(nextStaffScheduleData).forEach(([staffId, staffRow]) => {
                const daily = (staffRow && staffRow.dailySchedule) ? staffRow.dailySchedule : {};
                Object.entries(daily).forEach(([dateStr, value]) => {
                    if (!value) return;
                    if (!scheduleResultSnapshot[staffId]) {
                        scheduleResultSnapshot[staffId] = {};
                    }
                    scheduleResultSnapshot[staffId][dateStr] = value;
                });
            });

            const copiedReport = activeMonthlyConfig.dayShiftReport
                ? JSON.parse(JSON.stringify(activeMonthlyConfig.dayShiftReport))
                : null;
            if (copiedReport) {
                copiedReport.source = 'monthlyScheduleSync';
                copiedReport.syncedAt = new Date().toISOString();
            }

            Store.updateScheduleResultConfig(configId, {
                staffScheduleData: nextStaffScheduleData,
                scheduleResultSnapshot,
                dayShiftReport: copiedReport,
                updatedAt: new Date().toISOString()
            }, true);

            // 重新渲染
            await this.viewConfig(configId);
            alert('排班展示已同步月度班次配置（仅用于人工微调与校验）');
        } catch (error) {
            console.error('生成失败:', error);
            alert('生成失败: ' + error.message);
        }
    },

    /**
     * 更新配置名称
     */
    async updateConfigName() {
        const input = document.getElementById('scheduleDisplayConfigNameInput');
        if (!input) return;

        const newName = input.value.trim();
        if (!newName) {
            alert('配置名称不能为空');
            input.value = this.currentConfigId ? Store.getScheduleResultConfig(this.currentConfigId)?.name || '' : '';
            return;
        }

        try {
            Store.updateScheduleResultConfig(this.currentConfigId, {
                name: newName
            }, true);
        } catch (error) {
            console.error('更新配置名称失败:', error);
            alert('更新失败: ' + error.message);
        }
    },

    /**
     * 更新班别
     */
    async updateShiftType(configId, staffId, newShiftType) {
        try {
            const config = Store.getScheduleResultConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }

            if (!config.staffScheduleData) {
                config.staffScheduleData = {};
            }
            if (!config.staffScheduleData[staffId]) {
                config.staffScheduleData[staffId] = {
                    staffId: staffId,
                    dailySchedule: {}
                };
            }

            config.staffScheduleData[staffId].shiftType = newShiftType;
            config.updatedAt = new Date().toISOString();

            Store.updateScheduleResultConfig(configId, {
                staffScheduleData: config.staffScheduleData,
                updatedAt: config.updatedAt
            }, true);
        } catch (error) {
            console.error('更新班别失败:', error);
            alert('更新失败: ' + error.message);
        }
    },

    /**
     * 更新排班单元格
     */
    async updateScheduleCell(configId, staffId, dateStr, newValue) {
        try {
            const config = Store.getScheduleResultConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }

            if (!config.staffScheduleData) {
                config.staffScheduleData = {};
            }
            if (!config.staffScheduleData[staffId]) {
                config.staffScheduleData[staffId] = {
                    staffId: staffId,
                    dailySchedule: {}
                };
            }
            if (!config.staffScheduleData[staffId].dailySchedule) {
                config.staffScheduleData[staffId].dailySchedule = {};
            }

            if (newValue === '' || !newValue) {
                delete config.staffScheduleData[staffId].dailySchedule[dateStr];
            } else {
                config.staffScheduleData[staffId].dailySchedule[dateStr] = newValue;
            }

            // 同步更新 scheduleResultSnapshot
            if (!config.scheduleResultSnapshot) {
                config.scheduleResultSnapshot = {};
            }
            if (!config.scheduleResultSnapshot[staffId]) {
                config.scheduleResultSnapshot[staffId] = {};
            }

            if (newValue === '' || !newValue) {
                delete config.scheduleResultSnapshot[staffId][dateStr];
            } else {
                config.scheduleResultSnapshot[staffId][dateStr] = newValue;
            }

            config.updatedAt = new Date().toISOString();

            Store.updateScheduleResultConfig(configId, {
                staffScheduleData: config.staffScheduleData,
                scheduleResultSnapshot: config.scheduleResultSnapshot,
                updatedAt: config.updatedAt
            }, true);
        } catch (error) {
            console.error('更新排班单元格失败:', error);
            alert('更新失败: ' + error.message);
        }
    },

    /**
     * 切换人员类型筛选下拉框
     */
    togglePersonTypeFilterDropdown() {
        const dropdown = document.getElementById('scheduleDetailPersonTypeDropdown');
        if (dropdown) {
            dropdown.classList.toggle('hidden');
        }
    },

    /**
     * 切换全部人员类型
     */
    togglePersonTypeFilterAll(checkbox) {
        const allTypes = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
        const checkboxes = [
            document.getElementById('scheduleDetailFilterPersonType1'),
            document.getElementById('scheduleDetailFilterPersonType2'),
            document.getElementById('scheduleDetailFilterPersonType3'),
            document.getElementById('scheduleDetailFilterPersonType4')
        ];

        checkboxes.forEach(cb => {
            if (cb) cb.checked = checkbox.checked;
        });

        if (checkbox.checked) {
            this.filterState.personTypes = [...allTypes];
        } else {
            this.filterState.personTypes = [];
        }

        const config = Store.getScheduleResultConfig(this.currentConfigId);
        if (config) {
            this.renderScheduleDetail(config);
        }
    },

    /**
     * 更新人员类型筛选
     */
    updatePersonTypeFilter() {
        const allTypes = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
        const checkboxes = [
            document.getElementById('scheduleDetailFilterPersonType1'),
            document.getElementById('scheduleDetailFilterPersonType2'),
            document.getElementById('scheduleDetailFilterPersonType3'),
            document.getElementById('scheduleDetailFilterPersonType4')
        ];

        const selected = [];
        checkboxes.forEach((cb, index) => {
            if (cb && cb.checked) {
                selected.push(allTypes[index]);
            }
        });

        this.filterState.personTypes = selected;

        // 更新全部复选框状态
        const allCheckbox = document.getElementById('scheduleDetailFilterPersonTypeAll');
        if (allCheckbox) {
            allCheckbox.checked = selected.length === allTypes.length;
        }

        const config = Store.getScheduleResultConfig(this.currentConfigId);
        if (config) {
            this.renderScheduleDetail(config);
        }
    },

    /**
     * 校验并保存
     */
    async validateAndSave(configId) {
        try {
            const config = Store.getScheduleResultConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }

            // 这里可以添加校验逻辑
            // 暂时只保存
            Store.updateScheduleResultConfig(configId, {
                updatedAt: new Date().toISOString()
            }, true);

            // 保存到数据库
            await Store.saveState();

            alert('保存成功');
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败: ' + error.message);
        }
    },

    /**
     * 将算法输出转为页面可编辑结构
     */
    buildStaffScheduleDataFromResult(scheduleResult, staffData, dayShiftStats = {}) {
        const out = {};
        const shiftAssignments = dayShiftStats.monthlyShiftAssignments || {};

        (staffData || []).forEach((staff) => {
            const staffId = String(staff.staffId || staff.id || '');
            if (!staffId) return;
            out[staffId] = {
                staffId,
                staffName: staff.name || '',
                shiftType: shiftAssignments[staffId] || '',
                dailySchedule: {}
            };
        });

        Object.entries(scheduleResult || {}).forEach(([staffId, dates]) => {
            if (!out[staffId]) {
                out[staffId] = {
                    staffId: String(staffId),
                    staffName: String(staffId),
                    shiftType: shiftAssignments[staffId] || '',
                    dailySchedule: {}
                };
            }

            Object.entries(dates || {}).forEach(([dateStr, value]) => {
                const mapped = this.mapScheduleValueForTable(value);
                if (mapped) {
                    out[staffId].dailySchedule[dateStr] = mapped;
                }
            });
        });

        return out;
    },

    mapScheduleValueForTable(value) {
        if (!value) return '';
        const v = String(value);
        if (v === 'NIGHT') return '大夜';
        if (v === 'REST') return '休息';
        if (v === 'LEGAL') return '法定休假';
        if (v === 'ANNUAL') return '年休假';
        return v;
    },

    /**
     * 顶部摘要（非弹窗）
     */
    renderDayShiftSummaryCard(config) {
        const report = config.dayShiftReport;
        if (!report || !report.stats) {
            return `
                <div class="mb-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                    <div class="text-sm text-yellow-800">尚未检测到白班算法报告。请先在“月度班次配置”生成排班，再点击“生成排班展示”同步结果。</div>
                </div>
            `;
        }

        const stats = report.stats || {};
        const hard = stats.hardViolations || {};
        const hardOk = (hard.total || 0) === 0;
        const hardClass = hardOk
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700';
        const hardText = hardOk ? '硬约束通过' : '硬约束未通过';

        return `
            <div class="mb-3 p-3 rounded-lg border ${hardClass}">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-sm font-semibold">${hardText}</div>
                    <div class="text-xs opacity-80">生成时间：${this.escapeHtml(report.generatedAt || '-')}</div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                    <div class="px-2 py-1 rounded bg-white border border-gray-200">总违约: <b>${hard.total || 0}</b></div>
                    <div class="px-2 py-1 rounded bg-white border border-gray-200">最低人力缺口: <b>${hard.dailyShortage || 0}</b></div>
                    <div class="px-2 py-1 rounded bg-white border border-gray-200">目标天数违约: <b>${hard.targetMismatch || 0}</b></div>
                    <div class="px-2 py-1 rounded bg-white border border-gray-200">放宽层级: <b>${this.escapeHtml(stats.relaxationLevel || '-')}</b></div>
                    <div class="px-2 py-1 rounded bg-white border border-gray-200">额外白班总数: <b>${stats.extraDayTotal || 0}</b></div>
                    <div class="px-2 py-1 rounded bg-white border border-gray-200">特殊休假置空: <b>${(report.meta?.vacationCleared || []).length}</b></div>
                </div>
            </div>
        `;
    },

    /**
     * 详细报告（页面内）
     */
    renderDayShiftDetailedReport(config) {
        const report = config.dayShiftReport;
        if (!report || !report.stats) {
            return `
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">白班算法详细报告</h3>
                    <div class="text-sm text-gray-500">暂无数据。请先在“月度班次配置”生成排班后再同步到此页面。</div>
                </div>
            `;
        }

        const stats = report.stats || {};
        const meta = report.meta || {};
        const hard = stats.hardViolations || {};
        const shortageByDate = hard.shortageByDate || {};
        const extraDayUsage = stats.extraDayUsage || {};
        const vacationCleared = meta.vacationCleared || [];
        const warnings = stats.warnings || [];

        const shortageRows = Object.keys(shortageByDate).map((dateStr) => {
            const byShift = shortageByDate[dateStr] || {};
            const txt = Object.entries(byShift).map(([shift, n]) => `${shift}:${n}`).join(', ');
            return `
                <tr>
                    <td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(dateStr)}</td>
                    <td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(txt || '-')}</td>
                </tr>
            `;
        }).join('');

        const extraRows = Object.entries(extraDayUsage).map(([staffId, n]) => `
            <tr>
                <td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(staffId)}</td>
                <td class="px-2 py-1 border border-gray-200 text-xs">${n}</td>
            </tr>
        `).join('');

        const clearRows = vacationCleared.map((v) => `
            <tr>
                <td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(v.staffId || '-')}</td>
                <td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(v.dateStr || '-')}</td>
                <td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(v.type || '-')}</td>
            </tr>
        `).join('');

        const warningRows = warnings.map((w) => `
            <tr>
                <td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(w)}</td>
            </tr>
        `).join('');

        return `
            <div class="bg-white rounded-lg shadow-sm p-6">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">白班算法详细报告</h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div>
                        <h4 class="text-sm font-semibold text-gray-700 mb-2">A. 硬约束统计</h4>
                        <table class="min-w-full border border-gray-200">
                            <tbody>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">总违约</td><td class="px-2 py-1 border border-gray-200 text-xs">${hard.total || 0}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">最低人力缺口</td><td class="px-2 py-1 border border-gray-200 text-xs">${hard.dailyShortage || 0}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">目标天数违约</td><td class="px-2 py-1 border border-gray-200 text-xs">${hard.targetMismatch || 0}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">连续上班超上限（软）</td><td class="px-2 py-1 border border-gray-200 text-xs">${hard.maxWorkViolation || 0}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">连续休假超上限（软）</td><td class="px-2 py-1 border border-gray-200 text-xs">${hard.maxRestViolation || 0}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-gray-700 mb-2">B. 求解摘要</h4>
                        <table class="min-w-full border border-gray-200">
                            <tbody>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">放宽层级</td><td class="px-2 py-1 border border-gray-200 text-xs">${this.escapeHtml(stats.relaxationLevel || '-')}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">尝试次数</td><td class="px-2 py-1 border border-gray-200 text-xs">${stats.attempts || 0}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">总分配数</td><td class="px-2 py-1 border border-gray-200 text-xs">${stats.totalAssignments || 0}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">额外白班总数</td><td class="px-2 py-1 border border-gray-200 text-xs">${stats.extraDayTotal || 0}</td></tr>
                                <tr><td class="px-2 py-1 border border-gray-200 text-xs">特殊休假置空次数</td><td class="px-2 py-1 border border-gray-200 text-xs">${vacationCleared.length}</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="mb-5">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">C. 每日最低人力缺口明细</h4>
                    ${shortageRows ? `
                        <table class="min-w-full border border-gray-200">
                            <thead><tr><th class="px-2 py-1 border border-gray-200 text-xs text-left">日期</th><th class="px-2 py-1 border border-gray-200 text-xs text-left">缺口</th></tr></thead>
                            <tbody>${shortageRows}</tbody>
                        </table>
                    ` : `<div class="text-xs text-gray-500">无缺口。</div>`}
                </div>

                <div class="mb-5">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">D. +1 白班使用明细</h4>
                    ${extraRows ? `
                        <table class="min-w-full border border-gray-200">
                            <thead><tr><th class="px-2 py-1 border border-gray-200 text-xs text-left">员工ID</th><th class="px-2 py-1 border border-gray-200 text-xs text-left">额外白班天数</th></tr></thead>
                            <tbody>${extraRows}</tbody>
                        </table>
                    ` : `<div class="text-xs text-gray-500">未使用额外白班。</div>`}
                </div>

                <div class="mb-5">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">E. 特殊休假置空明细</h4>
                    ${clearRows ? `
                        <table class="min-w-full border border-gray-200">
                            <thead><tr><th class="px-2 py-1 border border-gray-200 text-xs text-left">员工ID</th><th class="px-2 py-1 border border-gray-200 text-xs text-left">日期</th><th class="px-2 py-1 border border-gray-200 text-xs text-left">类型</th></tr></thead>
                            <tbody>${clearRows}</tbody>
                        </table>
                    ` : `<div class="text-xs text-gray-500">本次未置空特殊休假。</div>`}
                </div>

                <div>
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">F. 告警信息</h4>
                    ${warningRows ? `
                        <table class="min-w-full border border-gray-200">
                            <tbody>${warningRows}</tbody>
                        </table>
                    ` : `<div class="text-xs text-gray-500">无告警。</div>`}
                </div>
            </div>
        `;
    },

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * 渲染排班表格（完全模仿个性化休假配置的表格结构）
     */
    renderScheduleTable(config) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const scheduleResult = config.scheduleResultSnapshot || {};
        const scheduleConfig = config.scheduleConfig;
        const staffData = Store.getCurrentStaffData();

        // 检查必要的函数
        if (typeof generateDateList === 'undefined') {
            scheduleTable.innerHTML = '<div class="p-8 text-center text-red-600">系统函数未加载，请刷新页面重试</div>';
            return;
        }

        // 生成日期列表（使用与个性化休假配置相同的函数）
        const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);

        // 获取休息日数据
        const allRestDays = Store.getAllRestDays();

        // 获取个人休假需求
        const allPersonalRequests = Store.getAllPersonalRequests();

        let html = `
            <div class="p-4 border-b border-gray-200 bg-white">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <h2 class="text-lg font-bold text-gray-800">排班结果查看</h2>
                        <span class="text-sm text-gray-500">-</span>
                        <span class="text-sm text-gray-900">${config.name}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="ScheduleDisplayManager.exportToExcel('${config.configId}')"
                                class="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium">
                            导出 Excel
                        </button>
                        <button onclick="ScheduleDisplayManager.backToConfigList()"
                                class="px-3 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-xs font-medium">
                            返回列表
                        </button>
                    </div>
                </div>

                <div class="text-xs text-gray-500 mb-2">
                    <p>说明：此页面仅用于查看排班结果，无法编辑。如需修改排班，请重新生成。</p>
                    <p>排班周期: ${scheduleConfig.year}${String(scheduleConfig.month).padStart(2, '0')}
                       (${scheduleConfig.startDate} 至 ${scheduleConfig.endDate})</p>
                </div>
            </div>

            <div class="overflow-x-auto overflow-y-auto" style="max-height: calc(100vh - 320px);">
                <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: fixed;">
                    <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                        <tr>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 40px; min-width: 40px;">状态</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 60px; min-width: 60px;">ID</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 70px; min-width: 70px;">姓名</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="width: 100px; min-width: 100px;">人员类型</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="width: 80px; min-width: 80px;">归属地</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-purple-100" style="width: 80px; min-width: 80px;">班别</th>
        `;

        // 生成日期表头（与个性化休假配置完全一致）
        dateList.forEach(dateInfo => {
            const holidayName = dateInfo.holidayName || '';
            const isWeekend = dateInfo.isWeekend;
            const isHoliday = dateInfo.isHoliday;

            const bgColor = isHoliday ? 'bg-red-100' : isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
            const textColor = isHoliday ? 'text-red-700' : isWeekend ? 'text-yellow-700' : 'text-gray-700';
            const borderColor = isHoliday ? 'border-red-300' : isWeekend ? 'border-yellow-200' : 'border-gray-300';

            let titleText = dateInfo.dateStr;
            if (holidayName) {
                titleText += ` - ${holidayName}`;
            }
            if (isWeekend && !isHoliday) {
                titleText += ' (周末)';
            }

            html += `
                <th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}"
                    style="width: 30px; min-width: 30px; position: relative;"
                    title="${titleText}">
                    <div class="text-xs font-bold">${dateInfo.day}</div>
                    <div class="text-xs">${dateInfo.weekday}</div>
                    ${holidayName ? `<div class="text-[10px] text-red-600 font-semibold mt-0.5">${holidayName}</div>` : ''}
                </th>
            `;
        });

        html += `
                        </tr>
                        <!-- 法定休息日行（班别配置行） -->
                        <tr class="bg-blue-50 font-semibold" style="position: sticky; top: 0; z-index: 19;">
                            <td class="px-1 py-1 text-center text-xs text-gray-700 border border-gray-300" colspan="6">班别配置</td>
        `;

        // 法定休息日行（显示休息日/工作日）
        dateList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const isRestDay = allRestDays[dateStr] === true;

            // 颜色逻辑（与个性化休假配置一致）
            let restDayClass;
            if (isRestDay) {
                restDayClass = 'bg-blue-400 text-white';
            } else {
                restDayClass = 'bg-gray-50 text-gray-800';
            }

            html += `
                <td class="px-0.5 py-1 text-center text-xs border border-gray-300 cursor-not-allowed ${restDayClass} font-semibold"
                    data-date="${dateStr}"
                    title="${isRestDay ? '休息日' : '工作日'}">
                    ${isRestDay ? '休' : '班'}
                </td>
            `;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // 生成人员行
        staffData.forEach((staff, index) => {
            const staffId = staff.staffId || staff.id;
            const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            const assignments = scheduleResult[staffId] || {};
            const personalRequests = allPersonalRequests[staffId] || {};

            html += `
                <tr class="${rowClass}" data-staff-id="${staffId}">
                    <td class="px-1 py-1 text-center border border-gray-300 align-middle">
                        <span class="inline-block w-4 h-4"></span>
                    </td>
                    <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.id}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-blue-700 border border-gray-300 bg-blue-50">${staff.personType || '未设置'}</td>
                    <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.location || '未知'}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-purple-700 border border-gray-300 bg-purple-50">${staff.shiftType || assignments._shiftType || '-'}</td>
            `;

            // 生成每日班次
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const shift = assignments[dateStr] || '';
                const personalRequest = personalRequests[dateStr] || '';
                const isRestDay = allRestDays[dateStr] === true;
                const isWeekend = dateInfo.isWeekend;

                // 确定单元格背景色（周末和休息日使用不同背景）
                let cellBgClass = '';
                if (isRestDay) {
                    cellBgClass = 'bg-blue-100';
                } else if (isWeekend) {
                    cellBgClass = 'bg-yellow-50';
                }

                // 如果有个人休假需求，优先显示
                if (personalRequest && personalRequest !== '') {
                    html += `
                        <td class="px-0.5 py-1 text-center border border-gray-300 ${cellBgClass}">
                            <span class="inline-block px-1 py-0.5 bg-red-500 text-white text-xs rounded">${personalRequest}</span>
                        </td>
                    `;
                } else if (shift) {
                    // 根据班次类型设置样式
                    let shiftClass = '';
                    if (shift === '大夜') {
                        shiftClass = 'bg-purple-500 text-white font-bold';
                    } else if (shift === '休息' || shift === '休') {
                        shiftClass = 'bg-gray-300 text-gray-700';
                    } else {
                        // 技能组样式
                        shiftClass = 'bg-indigo-100 text-indigo-800';
                    }

                    html += `
                        <td class="px-0.5 py-1 text-center border border-gray-300 ${cellBgClass}">
                            <span class="inline-block px-1 py-0.5 ${shiftClass} text-xs rounded">${shift}</span>
                        </td>
                    `;
                } else {
                    html += `
                        <td class="px-0.5 py-1 text-center border border-gray-300 ${cellBgClass} text-xs text-gray-400">-</td>
                    `;
                }
            });

            html += `
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 返回配置列表
     */
    backToConfigList() {
        this.currentView = 'configs';
        this.currentConfigId = null;
        Store.updateState({
            currentSubView: 'configs',
            currentConfigId: null
        }, false);
        this.renderConfigList();
    },

    /**
     * 取消激活配置
     */
    async deactivateConfig() {
        if (!confirm('确定要取消激活当前配置吗？')) return;

        try {
            if (typeof Store.clearActiveScheduleResultConfig !== 'function') {
                throw new Error('Store.clearActiveScheduleResultConfig 不可用');
            }
            await Store.clearActiveScheduleResultConfig();
            this.renderConfigList();
            alert('已取消激活');
        } catch (error) {
            console.error('取消激活失败:', error);
            alert('取消激活失败: ' + error.message);
        }
    },

    /**
     * 重命名配置
     */
    renameConfig(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const newName = prompt('请输入新的配置名称:', config.name);
        if (newName && newName.trim()) {
            Store.updateScheduleResultConfig(configId, {
                name: newName.trim()
            }, true);
            this.renderConfigList();

            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('配置已重命名', 'success');
            }
        }
    },

    /**
     * 复制配置
     */
    duplicateConfig(configId) {
        try {
            const source = Store.getScheduleResultConfig(configId);
            if (!source) {
                alert('配置不存在');
                return;
            }
            const chainContext = this.getActivationChainContext(source, { requireMonthly: false });
            if (!chainContext.ok) {
                alert(chainContext.message);
                return;
            }
            alert('当前激活锁仅允许一条排班结果配置，暂不支持复制。');
            return;
        } catch (error) {
            alert('复制失败：' + error.message);
        }
    },

    /**
     * 删除配置
     */
    deleteConfig(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        if (confirm(`确定要删除配置"${config.name}"吗？`)) {
            try {
                Store.deleteScheduleResultConfig(configId);
                this.renderConfigList();

                if (typeof StatusUtils !== 'undefined') {
                    StatusUtils.updateStatus('配置已删除', 'success');
                }
            } catch (error) {
                alert('删除失败：' + error.message);
            }
        }
    },

    /**
     * 导出配置到Excel
     */
    exportToExcel(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const scheduleResult = config.scheduleResultSnapshot || {};
        const scheduleConfig = config.scheduleConfig;
        const staffData = Store.getCurrentStaffData();

        if (!staffData || staffData.length === 0) {
            alert('无人员数据');
            return;
        }

        // 生成日期列表
        const startDate = new Date(scheduleConfig.startDate);
        const endDate = new Date(scheduleConfig.endDate);
        const dates = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().split('T')[0]);
        }

        // 准备Excel数据
        const excelData = [];

        // 表头
        const headers = ['员工ID', '姓名', '人员类型', '地点', '班别', '技能'];
        dates.forEach(d => headers.push(d));
        excelData.push(headers);

        // 员工数据
        staffData.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            const assignments = scheduleResult[staffId] || {};
            const shiftType = assignments._shiftType || staff.shiftType || '-';

            const row = [
                staffId,
                staff.name || '',
                staff.personType || '未设置',
                staff.location || '未知',
                shiftType,
                (staff.skills || []).join(', ')
            ];

            dates.forEach(d => {
                // 排除 _shiftType 字段（这是内部使用的）
                const assignment = assignments[d] || '';
                row.push(assignment);
            });

            excelData.push(row);
        });

        // 导出
        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '排班结果');

            const fileName = `排班结果_${config.name}_${new Date().getTime()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('已导出排班结果', 'success');
            }
        } else {
            alert('Excel导出功能未加载');
        }
    },

    // ==================== 分步骤排班功能 ====================

    /**
     * 分步骤排班状态
     */
    stepByStepState: {
        currentStep: 0,
        totalSteps: 4,
        steps: [
            { id: 1, name: '大夜排班', description: '安排大夜班次，考虑休假冲突和人员优先级', status: 'pending' },
            { id: 2, name: '休息排班', description: '基于大夜结果安排剩余休息日', status: 'pending' },
            { id: 3, name: '白班排班', description: '安排白班技能组分配', status: 'pending' },
            { id: 4, name: '完成整合', description: '整合所有排班结果并保存', status: 'pending' }
        ],
        // 存储每步的结果
        results: {
            nightShiftSchedule: {},
            mandatoryRestDays: {},
            additionalRestDays: {},
            dayShiftSchedule: {},
            dayShiftStats: null,
            dayShiftMeta: null,
            finalSchedule: {}
        },
        // 中间数据
        intermediateData: {
            restQuotas: {},
            processedPersonalRequests: {}
        }
    },

    /**
     * 开始分步骤排班流程
     */
    async startStepByStepScheduling() {
        const staffData = Store.getCurrentStaffData();
        const scheduleConfig = Store.getState('scheduleConfig');
        const personalRequests = Store.getAllPersonalRequests();
        const restDays = Store.getAllRestDays();

        if (!staffData || staffData.length === 0) {
            alert('请先上传人员数据');
            return;
        }

        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            alert('请先配置排班周期');
            return;
        }

        console.log('[ScheduleDisplayManager] 开始分步骤排班流程...');

        // 重置状态
        this.stepByStepState.currentStep = 0;
        this.stepByStepState.results = {
            nightShiftSchedule: {},
            mandatoryRestDays: {},
            additionalRestDays: {},
            dayShiftSchedule: {},
            dayShiftStats: null,
            dayShiftMeta: null,
            finalSchedule: {}
        };
        this.stepByStepState.intermediateData = {
            restQuotas: {},
            processedPersonalRequests: {}
        };
        this.stepByStepState.steps.forEach(step => step.status = 'pending');

        // 保存中间数据供后续步骤使用
        this.stepByStepState.intermediateData.staffData = staffData;
        this.stepByStepState.intermediateData.scheduleConfig = scheduleConfig;
        this.stepByStepState.intermediateData.personalRequests = personalRequests;
        this.stepByStepState.intermediateData.restDays = restDays;

        // 预处理：直接使用休假需求（不计算配额，大夜排班只需检查特定日期是否有休假声明）
        console.log('[ScheduleDisplayManager] 预处理：直接使用休假需求...');
        this.stepByStepState.intermediateData.processedPersonalRequests = personalRequests;
        console.log('[ScheduleDisplayManager] 休假数据准备完成（无需配额计算）');

        // 显示步骤UI并开始第一步
        this.renderStepByStepUI();
        await this.executeStep(1);
    },

    /**
     * 渲染分步骤排班UI
     */
    renderStepByStepUI() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        const stepsHTML = this.stepByStepState.steps.map((step, index) => `
            <div class="step-item" id="step-item-${step.id}">
                <div class="step-indicator ${index === 0 ? 'active' : ''}" id="step-indicator-${step.id}">
                    <span class="step-number">${step.id}</span>
                    <span class="step-status" id="step-status-${step.id}">○</span>
                </div>
                <div class="step-content">
                    <h3 class="step-title">${step.name}</h3>
                    <p class="step-description">${step.description}</p>
                </div>
            </div>
        `).join('');

        mainContent.innerHTML = `
            <div class="step-by-step-scheduling">
                <div class="scheduling-header">
                    <h2>排班流程（分步骤）</h2>
                    <p class="text-gray-600">逐步完成排班，每步完成后可查看结果</p>
                </div>

                <div class="steps-container">
                    ${stepsHTML}
                </div>

                <div class="scheduling-actions" id="scheduling-actions">
                    <button class="btn-secondary" onclick="ScheduleDisplayManager.cancelStepByStep()">
                        取消排班
                    </button>
                    <button class="btn-primary" id="next-step-btn" onclick="ScheduleDisplayManager.executeNextStep()">
                        开始第一步
                    </button>
                </div>

                <div class="step-result" id="step-result" style="display:none;">
                    <h3>当前步骤结果</h3>
                    <div id="step-result-content"></div>
                </div>

                <div class="scheduling-progress" id="scheduling-progress" style="display:none;">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <p class="progress-text" id="progress-text">正在处理...</p>
                </div>
            </div>

            <style>
                .step-by-step-scheduling {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .scheduling-header {
                    text-align: center;
                    margin-bottom: 40px;
                }
                .steps-container {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    position: relative;
                }
                .steps-container::before {
                    content: '';
                    position: absolute;
                    top: 30px;
                    left: 50px;
                    right: 50px;
                    height: 2px;
                    background: #e5e7eb;
                    z-index: 0;
                }
                .step-item {
                    flex: 1;
                    text-align: center;
                    position: relative;
                    z-index: 1;
                }
                .step-indicator {
                    width: 60px;
                    height: 60px;
                    margin: 0 auto 15px;
                    border-radius: 50%;
                    background: white;
                    border: 3px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    transition: all 0.3s;
                }
                .step-indicator.active {
                    border-color: #3b82f6;
                    background: #eff6ff;
                }
                .step-indicator.completed {
                    border-color: #10b981;
                    background: #ecfdf5;
                }
                .step-number {
                    font-size: 24px;
                    font-weight: bold;
                    color: #6b7280;
                }
                .step-indicator.active .step-number {
                    color: #3b82f6;
                }
                .step-indicator.completed .step-number {
                    color: #10b981;
                }
                .step-status {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    font-size: 14px;
                }
                .step-content h3 {
                    font-size: 16px;
                    margin-bottom: 5px;
                    color: #1f2937;
                }
                .step-content p {
                    font-size: 12px;
                    color: #6b7280;
                    margin: 0;
                }
                .scheduling-actions {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    margin-bottom: 30px;
                }
                .step-result {
                    background: #f9fafb;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .step-result h3 {
                    margin-top: 0;
                }
                .scheduling-progress {
                    margin-bottom: 20px;
                }
                .progress-bar {
                    width: 100%;
                    height: 30px;
                    background: #e5e7eb;
                    border-radius: 15px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #8b5cf6);
                    transition: width 0.3s;
                    width: 0%;
                }
                .progress-text {
                    text-align: center;
                    margin-top: 10px;
                    color: #6b7280;
                }
                .btn-primary, .btn-secondary {
                    padding: 10px 30px;
                    border-radius: 6px;
                    font-size: 14px;
                    cursor: pointer;
                    border: none;
                    transition: all 0.3s;
                }
                .btn-primary {
                    background: #3b82f6;
                    color: white;
                }
                .btn-primary:hover {
                    background: #2563eb;
                }
                .btn-primary:disabled {
                    background: #9ca3af;
                    cursor: not-allowed;
                }
                .btn-secondary {
                    background: #e5e7eb;
                    color: #374151;
                }
                .btn-secondary:hover {
                    background: #d1d5db;
                }
            </style>
        `;
    },

    /**
     * 执行指定步骤
     */
    async executeStep(stepNumber) {
        const step = this.stepByStepState.steps[stepNumber - 1];
        if (!step) return;

        console.log(`[ScheduleDisplayManager] 执行步骤${stepNumber}: ${step.name}...`);

        // 更新UI状态
        this.updateStepUI(stepNumber, 'active');
        this.showProgress(true, `正在执行${step.name}...`);

        const nextStepBtn = document.getElementById('next-step-btn');
        if (nextStepBtn) nextStepBtn.disabled = true;

        try {
            let resultHTML = '';

            switch(stepNumber) {
                case 1:
                    await this.executeNightShiftStep();
                    resultHTML = this.generateNightShiftResultHTML();
                    break;
                case 2:
                    await this.executeRestStep();
                    resultHTML = this.generateRestResultHTML();
                    break;
                case 3:
                    await this.executeDayShiftStep();
                    resultHTML = this.generateDayShiftResultHTML();
                    break;
                case 4:
                    await this.executeFinalizeStep();
                    resultHTML = this.generateFinalResultHTML();
                    break;
            }

            // 步骤完成
            this.updateStepUI(stepNumber, 'completed');
            step.status = 'completed';
            this.stepByStepState.currentStep = stepNumber;

            // 显示结果
            this.showProgress(false);
            this.showResult(resultHTML);

            // 更新下一步按钮
            if (nextStepBtn) {
                if (stepNumber < this.stepByStepState.totalSteps) {
                    nextStepBtn.textContent = `下一步：${this.stepByStepState.steps[stepNumber].name}`;
                    nextStepBtn.disabled = false;
                } else {
                    nextStepBtn.textContent = '完成';
                    nextStepBtn.onclick = () => this.finishStepByStep();
                }
            }

        } catch (error) {
            console.error(`[ScheduleDisplayManager] 步骤${stepNumber}执行失败:`, error);
            this.showProgress(false);
            alert(`步骤执行失败：${error.message}\n${error.stack}`);

            if (nextStepBtn) {
                nextStepBtn.disabled = false;
                nextStepBtn.textContent = '重试';
            }
        }
    },

    /**
     * 步骤1：执行大夜排班
     */
    async executeNightShiftStep() {
        const { staffData, scheduleConfig, processedPersonalRequests, restDays } = this.stepByStepState.intermediateData;

        if (typeof NightShiftSolver === 'undefined') {
            throw new Error('夜班排班模块未加载');
        }

        console.log('[ScheduleDisplayManager] 步骤1：生成大夜排班...');
        const nightShiftRules = typeof NightShiftRules !== 'undefined' ? NightShiftRules.getRules() : null;

        // 检查是否启用了渐进式求解算法
        const useIncremental = NightShiftSolver.algorithmMode === 'incremental';
        console.log(`[ScheduleDisplayManager] 使用算法: ${useIncremental ? 'IncrementalNightShiftSolver' : 'LegacySolver'}`);

        const nightShiftResult = await NightShiftSolver.generateNightShiftSchedule({
            staffData: staffData,
            scheduleConfig: scheduleConfig,
            personalRequests: processedPersonalRequests,
            restDays: restDays,
            rules: nightShiftRules,
            options: {
                algorithm: useIncremental ? 'incremental' : 'legacy'
            }
        });

        this.stepByStepState.results.nightShiftSchedule = nightShiftResult.schedule;
        this.stepByStepState.results.mandatoryRestDays = nightShiftResult.mandatoryRestDays || {};

        console.log('[ScheduleDisplayManager] 大夜排班完成，总夜班数:', nightShiftResult.stats.totalNightShifts);
    },

    /**
     * 步骤2：执行休息排班
     */
    async executeRestStep() {
        const { staffData, scheduleConfig, restQuotas } = this.stepByStepState.intermediateData;
        const { nightShiftSchedule, mandatoryRestDays } = this.stepByStepState.results;

        if (typeof BasicRestSolver === 'undefined') {
            console.warn('[ScheduleDisplayManager] BasicRestSolver未加载，跳过休息排班');
            return;
        }

        console.log('[ScheduleDisplayManager] 步骤2：生成休息排班...');
        const additionalRestDays = BasicRestSolver.calculateRemainingRestDays({
            staffData: staffData,
            scheduleConfig: scheduleConfig,
            restQuotas: restQuotas,
            currentSchedule: nightShiftSchedule,
            restDays: this.stepByStepState.intermediateData.restDays,
            mandatoryRestDays: mandatoryRestDays
        });

        this.stepByStepState.results.additionalRestDays = additionalRestDays;
        console.log('[ScheduleDisplayManager] 休息排班完成');
    },

    /**
     * 步骤3：执行白班排班
     */
    async executeDayShiftStep() {
        const { staffData, scheduleConfig, processedPersonalRequests, restDays } = this.stepByStepState.intermediateData;
        const { nightShiftSchedule, mandatoryRestDays, additionalRestDays } = this.stepByStepState.results;

        if (typeof CSPSolver === 'undefined') {
            throw new Error('白班排班算法模块未加载');
        }

        console.log('[ScheduleDisplayManager] 步骤3：生成白班排班...');

        // 合并所有休息日
        const allRestDays = { ...processedPersonalRequests };
        Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
            if (!allRestDays[staffId]) allRestDays[staffId] = {};
            dates.forEach(dateStr => {
                allRestDays[staffId][dateStr] = 'REST';
            });
        });
        Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
            if (!allRestDays[staffId]) allRestDays[staffId] = {};
            dates.forEach(dateStr => {
                allRestDays[staffId][dateStr] = 'REST';
            });
        });

        const dayShiftRules = typeof DayShiftRules !== 'undefined' ? DayShiftRules.getRules() : {};
        const dayShiftResult = await CSPSolver.generateDayShiftSchedule({
            staffData: staffData,
            scheduleConfig: scheduleConfig,
            personalRequests: allRestDays,
            restDays: restDays,
            nightSchedule: nightShiftSchedule,
            rules: dayShiftRules
        });

        this.stepByStepState.results.dayShiftSchedule = dayShiftResult.schedule;
        this.stepByStepState.results.dayShiftStats = dayShiftResult.stats || null;
        this.stepByStepState.results.dayShiftMeta = dayShiftResult.meta || null;
        console.log('[ScheduleDisplayManager] 白班排班完成，总分配数:', dayShiftResult.stats.totalAssignments);
    },

    /**
     * 步骤4：完成整合
     */
    async executeFinalizeStep() {
        const { processedPersonalRequests } = this.stepByStepState.intermediateData;
        const { nightShiftSchedule, mandatoryRestDays, additionalRestDays, dayShiftSchedule } = this.stepByStepState.results;

        console.log('[ScheduleDisplayManager] 步骤4：整合最终排班结果...');

        const scheduleResult = {};

        // 1. 个性化休假需求
        Object.entries(processedPersonalRequests).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            Object.entries(dates).forEach(([dateStr, status]) => {
                if (status === 'REQ') scheduleResult[staffId][dateStr] = 'REST';
            });
        });

        // 2. 夜班排班
        Object.entries(nightShiftSchedule).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            Object.entries(dates).forEach(([dateStr, shift]) => {
                if (shift && !scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = 'NIGHT';
                }
            });
        });

        // 3. 夜班后的必须休息日
        Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            dates.forEach(dateStr => {
                if (!scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = 'REST';
                }
            });
        });

        // 4. 补充的休息日
        Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            dates.forEach(dateStr => {
                if (!scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = 'REST';
                }
            });
        });

        // 5. 白班排班
        Object.entries(dayShiftSchedule).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            Object.entries(dates).forEach(([dateStr, shift]) => {
                if (shift && !scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = shift;
                }
            });
        });

        this.stepByStepState.results.finalSchedule = scheduleResult;
        console.log('[ScheduleDisplayManager] 最终排班结果整合完成');
    },

    /**
     * 执行下一步
     */
    async executeNextStep() {
        const nextStep = this.stepByStepState.currentStep + 1;
        if (nextStep <= this.stepByStepState.totalSteps) {
            await this.executeStep(nextStep);
        }
    },

    /**
     * 取消分步骤排班
     */
    cancelStepByStep() {
        if (confirm('确定要取消排班吗？已执行的结果将会丢失。')) {
            this.showScheduleDisplayManagement();
        }
    },

    /**
     * 完成分步骤排班
     */
    async finishStepByStep() {
        const { finalSchedule, dayShiftStats, dayShiftMeta } = this.stepByStepState.results;
        const { scheduleConfig } = this.stepByStepState.intermediateData;
        const staffData = this.stepByStepState.intermediateData.staffData || [];
        const chainContext = this.getActivationChainContext(null, { requireMonthly: false });
        if (!chainContext.ok) {
            alert(chainContext.message);
            return;
        }
        const yearMonth = `${scheduleConfig.year}${String(scheduleConfig.month).padStart(2, '0')}`;
        const targetCityScope = this.normalizeCityScope(chainContext.activeCityScope);
        const existing = this.findExistingConfigInCurrentLock();
        if (existing) {
            alert(`当前激活锁已存在排班结果配置：${existing.name}。请先删除后再保存分步骤结果。`);
            return;
        }

        // 保存结果
        const configId = Store.createScheduleResultConfig(
            `${yearMonth}-排班结果-分步骤`,
            finalSchedule,
            scheduleConfig,
            targetCityScope,
            chainContext.activeSchedulePeriodConfigId
        );

        Store.updateScheduleResultConfig(configId, {
            cityScope: targetCityScope,
            staffScheduleData: this.buildStaffScheduleDataFromResult(finalSchedule, staffData, dayShiftStats || {}),
            dayShiftReport: {
                generatedAt: new Date().toISOString(),
                source: 'stepByStep',
                stats: dayShiftStats || {},
                meta: dayShiftMeta || {}
            }
        }, true);

        if (typeof Store.setActiveScheduleResultConfig !== 'function') {
            throw new Error('Store.setActiveScheduleResultConfig 不可用');
        }
        await Store.setActiveScheduleResultConfig(configId);

        alert('排班完成！结果已保存。');

        // 返回配置列表
        this.showScheduleDisplayManagement();
    },

    /**
     * 更新步骤UI状态
     */
    updateStepUI(stepNumber, status) {
        // 移除之前的活动状态
        document.querySelectorAll('.step-indicator').forEach(el => {
            el.classList.remove('active');
        });

        // 更新当前步骤状态
        const indicator = document.getElementById(`step-indicator-${stepNumber}`);
        const statusEl = document.getElementById(`step-status-${stepNumber}`);

        if (indicator) {
            if (status === 'active') {
                indicator.classList.add('active');
            } else if (status === 'completed') {
                indicator.classList.remove('active');
                indicator.classList.add('completed');
            }
        }

        if (statusEl) {
            statusEl.textContent = status === 'completed' ? '✓' : (status === 'active' ? '●' : '○');
        }

        // 标记之前的步骤为完成
        for (let i = 1; i < stepNumber; i++) {
            const prevIndicator = document.getElementById(`step-indicator-${i}`);
            if (prevIndicator && !prevIndicator.classList.contains('completed')) {
                prevIndicator.classList.add('completed');
                const prevStatus = document.getElementById(`step-status-${i}`);
                if (prevStatus) prevStatus.textContent = '✓';
            }
        }
    },

    /**
     * 显示/隐藏进度条
     */
    showProgress(show, text = '') {
        const progressEl = document.getElementById('scheduling-progress');
        const progressText = document.getElementById('progress-text');
        const progressFill = document.getElementById('progress-fill');

        if (progressEl) {
            progressEl.style.display = show ? 'block' : 'none';
        }
        if (progressText && text) {
            progressText.textContent = text;
        }
        if (progressFill && show) {
            progressFill.style.width = '50%';
        }
    },

    /**
     * 显示步骤结果
     */
    showResult(html) {
        const resultEl = document.getElementById('step-result');
        const resultContent = document.getElementById('step-result-content');

        if (resultEl && resultContent) {
            resultEl.style.display = 'block';
            resultContent.innerHTML = html;
        }
    },

    /**
     * 生成大夜排班结果HTML
     */
    generateNightShiftResultHTML() {
        const { nightShiftSchedule, mandatoryRestDays } = this.stepByStepState.results;
        const staffData = this.stepByStepState.intermediateData.staffData;

        let html = '<div class="result-summary">';
        html += '<h4>大夜排班统计</h4>';

        // 统计每人排的大夜天数
        const stats = Object.entries(nightShiftSchedule).map(([staffId, dates]) => {
            const staff = staffData.find(s => s.id === staffId);
            const nightCount = Object.values(dates).filter(d => d === 'NIGHT').length;
            return {
                name: staff ? staff.name : staffId,
                nightCount: nightCount
            };
        });

        html += '<ul>';
        stats.forEach(stat => {
            html += `<li>${stat.name}: ${stat.nightCount}天大夜</li>`;
        });
        html += '</ul>';

        html += '</div>';
        return html;
    },

    /**
     * 生成休息排班结果HTML
     */
    generateRestResultHTML() {
        const { additionalRestDays } = this.stepByStepState.results;

        let html = '<div class="result-summary">';
        html += '<h4>休息排班完成</h4>';
        html += '<p>已基于大夜结果安排剩余休息日</p>';
        html += '</div>';
        return html;
    },

    /**
     * 生成白班排班结果HTML
     */
    generateDayShiftResultHTML() {
        const { dayShiftSchedule, dayShiftStats } = this.stepByStepState.results;
        const staffData = this.stepByStepState.intermediateData.staffData;

        let html = '<div class="result-summary">';
        html += '<h4>白班排班统计</h4>';

        // 统计每人排的白班天数
        const stats = Object.entries(dayShiftSchedule).map(([staffId, dates]) => {
            const staff = staffData.find(s => s.id === staffId);
            const dayCount = Object.values(dates).filter(d => d && d !== 'NIGHT' && d !== 'REST').length;
            return {
                name: staff ? staff.name : staffId,
                dayCount: dayCount
            };
        });

        html += '<ul>';
        stats.forEach(stat => {
            html += `<li>${stat.name}: ${stat.dayCount}天白班</li>`;
        });
        html += '</ul>';

        if (dayShiftStats) {
            const hv = dayShiftStats.hardViolations || {};
            html += `
                <div class="mt-3 text-sm text-gray-700">
                    <div>硬约束总违约: <b>${hv.total || 0}</b></div>
                    <div>最低人力缺口: <b>${hv.dailyShortage || 0}</b></div>
                    <div>目标天数违约: <b>${hv.targetMismatch || 0}</b></div>
                    <div>放宽层级: <b>${dayShiftStats.relaxationLevel || '-'}</b></div>
                    <div>额外白班总数: <b>${dayShiftStats.extraDayTotal || 0}</b></div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    },

    /**
     * 生成最终结果HTML
     */
    generateFinalResultHTML() {
        const { finalSchedule } = this.stepByStepState.results;

        let html = '<div class="result-summary">';
        html += '<h4>排班完成</h4>';
        html += `<p>已为${Object.keys(finalSchedule).length}名人员生成完整排班</p>`;
        html += '<p>点击"完成"按钮保存排班结果。</p>';
        html += '</div>';
        return html;
    },

    /**
     * 更新导航按钮状态
     */
    updateNavigationButtons(activeView) {
        const buttons = {
            btnSchedulePeriodView: 'schedulePeriod',
            btnStaffManageView: 'staff',
            btnRequestManageView: 'request',
            btnRuleConfigView: 'ruleConfig',
            btnDailyManpowerView: 'dailyManpower',
            btnScheduleView: 'scheduleDisplay'
        };

        Object.keys(buttons).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.classList.remove('bg-blue-600', 'bg-purple-600', 'bg-gray-400');
                const viewName = buttons[btnId];

                if (viewName === activeView) {
                    btn.classList.add(activeView === 'scheduleDisplay' ? 'bg-purple-600' : 'bg-blue-600');
                } else {
                    btn.classList.add('bg-gray-400');
                }
            }
        });
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.ScheduleDisplayManager = ScheduleDisplayManager;
}
