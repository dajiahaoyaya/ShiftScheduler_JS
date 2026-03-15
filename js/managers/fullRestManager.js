/**
 * 全量休息配置管理模块
 *
 * 负责全量休息配置的UI管理和交互逻辑，包括：
 * - 配置列表管理（仿照个性化休假配置）
 * - 配置详情展示
 * - 休假分配生成
 * - 交互式休假排班表格
 * - 配置复制、重命名、导入、导出
 */

const FullRestManager = {
    currentView: 'configs', // 'configs' | 'configDetail'
    currentConfigId: null,
    currentSchedule: null,
    currentManpowerAnalysis: null,

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
        if (!config) return 'ALL';
        if (config.cityScope) {
            return this.normalizeCityScope(config.cityScope);
        }
        const schedulePeriodConfig = config.schedulePeriodConfigId
            ? Store.getSchedulePeriodConfig(config.schedulePeriodConfigId)
            : null;
        return this.normalizeCityScope(schedulePeriodConfig && schedulePeriodConfig.cityScope);
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

    isConfigInActiveLock(config) {
        if (typeof Store !== 'undefined' && Store && typeof Store.isConfigInActiveLock === 'function') {
            return Store.isConfigInActiveLock(config, { configType: 'fullRest' });
        }
        return false;
    },

    findExistingConfigInActiveLock(excludeConfigId = null) {
        const configs = Store.getFullRestConfigs() || [];
        return configs.find((config) => {
            if (!config || (excludeConfigId && config.configId === excludeConfigId)) return false;
            return this.isConfigInActiveLock(config);
        }) || null;
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
            activeSchedulePeriodConfigId: activeLock.schedulePeriodConfigId,
            activeSchedulePeriodConfig,
            activeCityScope,
            activeLockKey: activeLock.lockKey,
            activeYearMonth: activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig
                ? `${activeSchedulePeriodConfig.scheduleConfig.year}${String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`
                : null
        };
    },

    findExistingConfigInCurrentLock(excludeConfigId = null) {
        return this.findExistingConfigInActiveLock(excludeConfigId);
    },

    downloadArchiveSnapshot(config, prefix = 'full-rest-archive') {
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
        const container = document.getElementById('scheduleTable');
        if (!container) return;
        const esc = (value) => String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const cityScope = this.getConfigCityScope(config);
        const periodText = (config && config.schedulePeriodConfigId && Store.getSchedulePeriodConfig)
            ? (() => {
                const periodCfg = Store.getSchedulePeriodConfig(config.schedulePeriodConfigId);
                return (periodCfg && periodCfg.scheduleConfig)
                    ? `${periodCfg.scheduleConfig.year}${String(periodCfg.scheduleConfig.month).padStart(2, '0')}`
                    : '未绑定';
            })()
            : '未绑定';
        const schedule = (config && config.fullRestSchedule && typeof config.fullRestSchedule === 'object')
            ? config.fullRestSchedule
            : {};
        const rowsHtml = Object.keys(schedule).sort().map((staffId) => {
            const map = schedule[staffId] && typeof schedule[staffId] === 'object' ? schedule[staffId] : {};
            const dates = Object.keys(map).sort();
            const days = dates.length;
            const sample = dates.slice(0, 8).join('、');
            const keyword = `${staffId} ${days} ${sample}`.toLowerCase();
            return `
                <tr data-archive-keyword="${esc(keyword)}" class="hover:bg-gray-50">
                    <td class="px-3 py-2 text-xs text-gray-900 border border-gray-200">${esc(staffId)}</td>
                    <td class="px-3 py-2 text-xs text-gray-900 border border-gray-200 font-medium">${days}</td>
                    <td class="px-3 py-2 text-xs text-gray-600 border border-gray-200">${esc(sample)}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="p-6 space-y-4">
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h2 class="text-xl font-bold text-gray-800 mb-1">${esc(config && config.name ? config.name : '归档配置')}</h2>
                    <p class="text-sm text-amber-800">归档只读：该配置不属于当前激活的城市+周期锁，仅支持查看和导出。</p>
                    <p class="text-xs text-gray-600 mt-2">排班周期：${esc(periodText)} ｜ 城市范围：${esc(this.getCityScopeLabel(cityScope))}</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="FullRestManager.showFullRestManagement()" class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium">返回配置列表</button>
                    <button onclick="FullRestManager.downloadArchiveSnapshot(Store.getFullRestConfig('${config.configId}'))" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">导出JSON</button>
                </div>
                <div class="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                    <input id="fullrest-archive-filter" type="text" placeholder="筛选：员工ID/休假日期" oninput="FullRestManager.filterArchiveTable(this.value)" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md">
                    <div class="overflow-x-auto overflow-y-auto" style="max-height: 60vh;">
                        <table class="min-w-full border-collapse">
                            <thead class="sticky top-0 bg-gray-50 z-10">
                                <tr>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">员工ID</th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">休假天数</th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200">样例日期（前8）</th>
                                </tr>
                            </thead>
                            <tbody id="fullrest-archive-tbody">
                                ${rowsHtml || '<tr><td colspan="3" class="px-3 py-6 text-center text-sm text-gray-500 border border-gray-200">暂无全量休息排班数据</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    filterArchiveTable(keyword) {
        const tbody = document.getElementById('fullrest-archive-tbody');
        if (!tbody) return;
        const q = String(keyword || '').trim().toLowerCase();
        const rows = tbody.querySelectorAll('tr[data-archive-keyword]');
        rows.forEach((row) => {
            const text = String(row.getAttribute('data-archive-keyword') || '');
            row.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
    },

    async chooseCityScope(actionLabel = '新建全量休息配置', defaultScope = 'ALL') {
        const initialScope = this.normalizeCityScope(defaultScope);
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50';
            const dialog = document.createElement('div');
            dialog.className = 'bg-white rounded-lg shadow-lg w-full max-w-md p-6';
            dialog.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-800 mb-4">${actionLabel}</h3>
                <p class="text-sm text-gray-600 mb-3">请选择城市范围并绑定到本次配置。</p>
                <select id="fullrest-city-scope-select" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-5">
                    <option value="SH" ${initialScope === 'SH' ? 'selected' : ''}>仅上海</option>
                    <option value="CD" ${initialScope === 'CD' ? 'selected' : ''}>仅成都</option>
                    <option value="ALL" ${initialScope === 'ALL' ? 'selected' : ''}>上海+成都</option>
                </select>
                <div class="flex justify-end space-x-3">
                    <button id="fullrest-city-scope-cancel" class="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300">取消</button>
                    <button id="fullrest-city-scope-ok" class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">确定</button>
                </div>
            `;
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cleanup = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };
            const cancelBtn = dialog.querySelector('#fullrest-city-scope-cancel');
            const okBtn = dialog.querySelector('#fullrest-city-scope-ok');
            const selectEl = dialog.querySelector('#fullrest-city-scope-select');

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
     * 显示全量休息配置管理主页面
     */
    async showFullRestManagement() {
        this.currentView = 'configs';
        this.currentConfigId = null;

        // 更新视图状态
        Store.updateState({
            currentView: 'fullRest',
            currentSubView: 'configs',
            currentConfigId: null
        }, false);

        // 渲染配置列表页面
        this.renderConfigList();
    },

    /**
     * 渲染配置列表页面（完全仿照个性化休假配置）
     */
    renderConfigList() {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const configs = Store.getFullRestConfigs();
        const activeConfigId = Store.getState('activeFullRestConfigId');
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        const activeSchedulePeriodConfig = activeSchedulePeriodConfigId
            ? Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId)
            : null;

        let currentYearMonth = null;
        if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig) {
            const year = activeSchedulePeriodConfig.scheduleConfig.year;
            const month = String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0');
            currentYearMonth = `${year}${month}`;
        } else if (activeConfigId) {
            const activeConfig = configs.find((cfg) => cfg && cfg.configId === activeConfigId);
            const linkedPeriod = activeConfig && activeConfig.schedulePeriodConfigId
                ? Store.getSchedulePeriodConfig(activeConfig.schedulePeriodConfigId)
                : null;
            if (linkedPeriod && linkedPeriod.scheduleConfig) {
                currentYearMonth = `${linkedPeriod.scheduleConfig.year}${String(linkedPeriod.scheduleConfig.month).padStart(2, '0')}`;
            }
        }

        const chainContext = this.getActivationChainContext();
        const chainCityScope = chainContext.ok
            ? this.normalizeCityScope(chainContext.activeCityScope)
            : null;

        console.log('renderConfigList: 激活配置ID:', activeConfigId);
        console.log('renderConfigList: 当前排班周期YYYYMM:', currentYearMonth);

        // 按锁展示全部配置，归档只读。
        const filteredConfigs = configs;

        const existingInActiveLock = chainContext.ok ? this.findExistingConfigInActiveLock() : null;
        const canCreateOrImport = chainContext.ok && !existingInActiveLock;
        let actionHint = '新建/导入将按“城市+周期锁唯一”校验';
        if (!chainContext.ok) {
            actionHint = chainContext.message;
        } else if (existingInActiveLock) {
            actionHint = `当前激活锁已存在配置：${existingInActiveLock.name}，请先删除后再新建或导入`;
        }
        const actionHintEscaped = String(actionHint || '').replace(/"/g, '&quot;');

        let html = `
            <div class="p-4">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">全量休息配置管理</h2>
                    <div class="flex items-center space-x-2">
                        <span class="text-sm text-gray-600">当前排班周期: ${currentYearMonth || '未设置'}${chainCityScope ? `｜上游激活城市: ${this.getCityScopeLabel(chainCityScope)}` : ''}</span>
                        <button onclick="if(typeof FullRestManager !== 'undefined') { FullRestManager.createNewConfig(); } else { alert('FullRestManager未加载'); }"
                                ${canCreateOrImport ? '' : 'disabled'}
                                title="${actionHintEscaped}"
                                class="px-4 py-2 text-white rounded-md transition-colors text-sm font-medium ${canCreateOrImport ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}">
                            新建
                        </button>
                        <button onclick="if(typeof FullRestManager !== 'undefined') { FullRestManager.importConfig(); } else { alert('FullRestManager未加载'); }"
                                ${canCreateOrImport ? '' : 'disabled'}
                                title="${actionHintEscaped}"
                                class="px-4 py-2 text-white rounded-md transition-colors text-sm font-medium ${canCreateOrImport ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}">
                            导入
                        </button>
                    </div>
                </div>
                <div class="bg-white rounded-lg shadow-sm overflow-hidden">
        `;

        if (filteredConfigs.length === 0) {
            html += `
                <div class="p-8 text-center">
                    <div class="max-w-md mx-auto">
                        <div class="mb-4">
                            <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                        </div>
                        <h3 class="text-lg font-medium text-gray-900 mb-2">暂无全量休息配置</h3>
                        <p class="text-sm text-gray-500 mb-6">${canCreateOrImport ? '请点击"新建"补齐当前锁配置' : actionHint}</p>
                        <button onclick="if(typeof FullRestManager !== 'undefined') { FullRestManager.createNewConfig(); } else { alert('FullRestManager未加载'); }"
                                ${canCreateOrImport ? '' : 'disabled'}
                                title="${actionHintEscaped}"
                                class="px-6 py-2 text-white rounded-md transition-colors text-sm font-medium ${canCreateOrImport ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}">
                            新建配置
                        </button>
                    </div>
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
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">休假数量</th>
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

            sortedConfigs.forEach((config, index) => {
                const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                const isActive = config.configId === activeConfigId;
                const vacationCount = this.getVacationCount(config.fullRestSchedule);
                const schedulePeriodConfig = Store.getSchedulePeriodConfig(config.schedulePeriodConfigId);
                const schedulePeriod = schedulePeriodConfig
                    ? `${schedulePeriodConfig.scheduleConfig.startDate} - ${schedulePeriodConfig.scheduleConfig.endDate}`
                    : '未设置';
                const configCityScope = this.getConfigCityScope(config);
                const rowOperateAllowed = chainContext.ok && this.isConfigInActiveLock(config);
                const rowOperateHint = rowOperateAllowed
                    ? ''
                    : (!chainContext.ok
                        ? actionHint
                        : '归档配置仅支持查看，不可编辑/导入/激活');
                const rowOperateHintEscaped = String(rowOperateHint || '').replace(/"/g, '&quot;');

                // 获取YYYYMM展示栏位
                let yearMonthDisplay = '-';
                if (schedulePeriodConfig && schedulePeriodConfig.scheduleConfig) {
                    yearMonthDisplay = `${schedulePeriodConfig.scheduleConfig.year}${String(schedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`;
                }

                html += `
                    <tr class="${isActive ? 'bg-blue-50' : rowClass}">
                        <td class="px-4 py-3 whitespace-nowrap">
                            <span class="text-sm font-bold text-gray-900">${yearMonthDisplay}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            <span class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">${this.getCityScopeLabel(this.getConfigCityScope(config))}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            <div class="flex items-center">
                                <span class="text-sm font-medium text-gray-900">${config.name}</span>
                            </div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${vacationCount} 条</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${schedulePeriod}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.createdAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.updatedAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            ${isActive
                                ? `<span class="px-2 py-1 rounded bg-green-500 text-white text-xs font-medium">已激活</span>`
                                : `<span class="text-gray-400">未激活</span>`
                            }
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            <div class="flex items-center space-x-2">
                                ${!isActive ? `
                                    <button onclick="FullRestManager.activateConfig('${config.configId}')"
                                            ${rowOperateAllowed ? '' : 'disabled'}
                                            title="${rowOperateHintEscaped}"
                                            class="${rowOperateAllowed ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'} font-medium">
                                        激活
                                    </button>
                                ` : `
                                    <button onclick="FullRestManager.deactivateConfig()"
                                            class="text-orange-600 hover:text-orange-800 font-medium">
                                        取消激活
                                    </button>
                                `}
                                <button onclick="if(typeof FullRestManager !== 'undefined') { FullRestManager.viewConfig('${config.configId}'); } else { alert('FullRestManager未加载'); }"
                                        class="text-blue-600 hover:text-blue-800 font-medium">
                                    查看
                                </button>
                                <button onclick="FullRestManager.editConfigName('${config.configId}')"
                                        class="text-yellow-600 hover:text-yellow-800 font-medium">
                                    重命名
                                </button>
                                <button onclick="FullRestManager.duplicateConfig('${config.configId}')"
                                        ${rowOperateAllowed ? '' : 'disabled'}
                                        title="${rowOperateHintEscaped}"
                                        class="${rowOperateAllowed ? 'text-green-600 hover:text-green-800' : 'text-gray-400 cursor-not-allowed'} font-medium">
                                    复制
                                </button>
                                <button onclick="FullRestManager.deleteConfig('${config.configId}')"
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

        html += `
                </div>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 获取休假数量统计
     * @param {Object} fullRestSchedule - 休假排班数据
     * @returns {number} 休假条数
     */
    getVacationCount(fullRestSchedule) {
        if (!fullRestSchedule) return 0;

        let count = 0;
        for (const staffId in fullRestSchedule) {
            count += Object.keys(fullRestSchedule[staffId]).length;
        }
        return count;
    },

    /**
     * 创建新配置
     */
    async createNewConfig() {
        const chainContext = this.getActivationChainContext();
        if (!chainContext.ok) {
            alert(chainContext.message);
            return;
        }
        const schedulePeriodConfig = chainContext.activeSchedulePeriodConfig;
        const activeSchedulePeriodConfigId = chainContext.activeSchedulePeriodConfigId;
        const targetCityScope = this.normalizeCityScope(chainContext.activeCityScope);
        const yearMonth = `${schedulePeriodConfig.scheduleConfig.year}${String(schedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`;
        const defaultName = `${yearMonth}-全量休息配置`;

        // 检查当前锁唯一配置
        const existing = this.findExistingConfigInCurrentLock();

        if (existing) {
            alert(`当前激活锁已存在配置：${existing.name}\n如需新建，请先删除后重建。`);
            return;
        }

        const name = prompt('请输入配置名称：', defaultName);
        if (!name || name.trim() === '') return;

        // 使用默认约束创建配置
        const constraints = FullRestConfigRules ? { ...FullRestConfigRules.defaultConfig } : {};
        const configId = Store.createFullRestConfig(name, activeSchedulePeriodConfigId, constraints, targetCityScope);

        await Store.saveState();
        await this.viewConfig(configId);
    },

    /**
     * 查看配置详情
     */
    async viewConfig(configId) {
        const config = Store.getFullRestConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }
        if (!this.isConfigInActiveLock(config)) {
            this.currentConfigId = configId;
            this.currentView = 'archiveView';
            Store.updateState({
                currentView: 'fullRest',
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
        this.currentConfigId = configId;
        this.currentView = 'configDetail';
        if (typeof Store.setActiveCityScope === 'function') {
            await Store.setActiveCityScope(this.getConfigCityScope(config), false);
        }

        // 渲染配置详情页面
        await this.renderConfigDetail(config);
    },

    /**
     * 渲染配置详情页面
     */
    async renderConfigDetail(config) {
        const container = document.getElementById('scheduleTable');
        if (!container) return;

        const schedulePeriodConfig = Store.getSchedulePeriodConfig(config.schedulePeriodConfigId);
        const periodStats = schedulePeriodConfig
            ? SchedulePeriodManager.calculatePeriodStats(schedulePeriodConfig)
            : null;

        let html = `
            <div class="p-6 space-y-6">
                <!-- 顶部操作栏 -->
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800">${config.name}</h2>
                        <p class="text-sm text-gray-500 mt-1">
                            ${schedulePeriodConfig ? `排班周期: ${schedulePeriodConfig.scheduleConfig.startDate} - ${schedulePeriodConfig.scheduleConfig.endDate}` : '未关联排班周期'}
                        </p>
                        ${periodStats ? `<p class="text-xs text-orange-600 mt-1">总休息日: ${periodStats.totalRestDays}天</p>` : ''}
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="FullRestManager.exportConfig('${config.configId}')"
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                            导出配置
                        </button>
                        <button onclick="FullRestManager.backToList()"
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
                            返回列表
                        </button>
                    </div>
                </div>

                <!-- 配置参数按钮（跳转到配置） -->
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-800">约束规则配置</h3>
                            <p class="text-sm text-gray-500 mt-1">配置大夜后休息、连续休假、休假间隔等约束参数</p>
                        </div>
                        <button onclick="FullRestManager.showConfigModal()"
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">
                            配置规则参数
                        </button>
                    </div>
                </div>

                <!-- 生成休假分配区域 -->
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">生成休假分配</h3>
                    <div class="flex gap-3">
                        <button onclick="FullRestManager.generateSchedule('${config.configId}')"
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">
                            生成休假分配
                        </button>
                    </div>
                </div>

                <!-- 结果展示区域（如果有） -->
                ${config.fullRestSchedule ? this.renderScheduleResult(config) : ''}
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 显示配置规则参数弹窗
     */
    showConfigModal() {
        const config = Store.getFullRestConfig(this.currentConfigId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const constraints = config.constraints || {};

        const modalHtml = `
            <div id="configModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                <div class="relative top-20 mx-auto p-5 border w-11/12 max-w-3xl shadow-lg rounded-md bg-white">
                    <div class="mt-3">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-medium text-gray-900">全量休息约束规则配置</h3>
                            <button onclick="document.getElementById('configModal').remove()" class="text-gray-400 hover:text-gray-500">
                                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div class="space-y-4">
                            <div class="grid grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">大夜后最少休息天数</label>
                                    <input type="number" id="fr_minRestAfterNight" min="0" max="7" value="${constraints.minRestAfterNightShift || 2}"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    <p class="text-xs text-gray-500 mt-1">大夜后必须休息的天数（0-7天）</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">最长连续休假天数</label>
                                    <input type="number" id="fr_maxConsecutiveRest" min="1" max="7" value="${constraints.maxConsecutiveRestDays || 2}"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    <p class="text-xs text-orange-600 mt-1">注意：休假尽量保证连续2天</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">休假间隔最大天数</label>
                                    <input type="number" id="fr_maxRestInterval" min="3" max="10" value="${constraints.maxRestInterval || 5}"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    <p class="text-xs text-gray-500 mt-1">两次休假之间的最大间隔天数（3-10天）</p>
                                </div>
                            </div>

                            <div class="border-t pt-4">
                                <h4 class="text-sm font-medium text-gray-900 mb-3">特殊节假日配置</h4>
                                <div class="grid grid-cols-3 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">春节（天）</label>
                                        <input type="text" id="fr_springDays" value="${this.getHolidayDays(constraints, 'SPRING_FESTIVAL')}"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md"
                                               placeholder="例如: 6-8">
                                        <p class="text-xs text-gray-500 mt-1">格式: min-max</p>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">国庆（天）</label>
                                        <input type="text" id="fr_nationalDays" value="${this.getHolidayDays(constraints, 'NATIONAL_DAY')}"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md"
                                               placeholder="例如: 4-7">
                                        <p class="text-xs text-gray-500 mt-1">格式: min-max</p>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">元旦（天）</label>
                                        <input type="number" id="fr_newYearDays" min="1" max="7" value="${this.getHolidayDays(constraints, 'NEW_YEAR') || 3}"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">清明（天）</label>
                                        <input type="number" id="fr_tombSweepingDays" min="1" max="7" value="${this.getHolidayDays(constraints, 'TOMB_SWEEPING') || 3}"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">端午（天）</label>
                                        <input type="number" id="fr_dragonBoatDays" min="1" max="7" value="${this.getHolidayDays(constraints, 'DRAGON_BOAT') || 3}"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">五一（天）</label>
                                        <input type="number" id="fr_laborDayDays" min="1" max="7" value="${this.getHolidayDays(constraints, 'LABOR_DAY') || 3}"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">中秋（天）</label>
                                        <input type="number" id="fr_midAutumnDays" min="1" max="7" value="${this.getHolidayDays(constraints, 'MID_AUTUMN') || 3}"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="flex gap-3 mt-6">
                            <button onclick="FullRestManager.saveConstraintsFromModal()"
                                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                                保存配置
                            </button>
                            <button onclick="document.getElementById('configModal').remove()"
                                    class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm">
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 添加到页面
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * 获取节假日天数
     */
    getHolidayDays(constraints, holidayKey) {
        const holiday = constraints.specialHolidays ? constraints.specialHolidays[holidayKey] : null;
        if (!holiday) return '';

        if (typeof holiday === 'number') {
            return holiday;
        } else if (typeof holiday === 'object') {
            return holiday.min && holiday.max ? `${holiday.min}-${holiday.max}` : '';
        }
        return '';
    },

    /**
     * 从弹窗保存约束配置
     */
    async saveConstraintsFromModal() {
        const constraints = {
            minRestAfterNightShift: parseInt(document.getElementById('fr_minRestAfterNight').value, 10),
            maxConsecutiveRestDays: parseInt(document.getElementById('fr_maxConsecutiveRest').value, 10),
            maxRestInterval: parseInt(document.getElementById('fr_maxRestInterval').value, 10),
            specialHolidays: {
                SPRING_FESTIVAL: this.parseHolidayDays(document.getElementById('fr_springDays').value),
                NATIONAL_DAY: this.parseHolidayDays(document.getElementById('fr_nationalDays').value),
                NEW_YEAR: { days: parseInt(document.getElementById('fr_newYearDays').value, 10), name: '元旦' },
                TOMB_SWEEPING: { days: parseInt(document.getElementById('fr_tombSweepingDays').value, 10), name: '清明' },
                DRAGON_BOAT: { days: parseInt(document.getElementById('fr_dragonBoatDays').value, 10), name: '端午' },
                LABOR_DAY: { days: parseInt(document.getElementById('fr_laborDayDays').value, 10), name: '五一' },
                MID_AUTUMN: { days: parseInt(document.getElementById('fr_midAutumnDays').value, 10), name: '中秋' }
            }
        };

        // 验证配置
        const validation = FullRestConfigRules ? FullRestConfigRules.validateConfig(constraints) : { valid: true, errors: [] };
        if (!validation.valid) {
            alert('配置验证失败:\n' + validation.errors.join('\n'));
            return;
        }

        Store.updateFullRestConfig(this.currentConfigId, { constraints });
        await Store.saveState();

        // 关闭弹窗
        document.getElementById('configModal').remove();

        alert('配置已保存');
        await this.renderConfigDetail(Store.getFullRestConfig(this.currentConfigId));
    },

    /**
     * 解析节假日天数（支持范围格式）
     */
    parseHolidayDays(value) {
        if (!value) return { days: 3 };

        if (value.includes('-')) {
            const parts = value.split('-');
            return {
                min: parseInt(parts[0], 10),
                max: parseInt(parts[1], 10)
            };
        }
        return { days: parseInt(value, 10) };
    },

    /**
     * 渲染排班结果（仿照个性化休假格式）
     */
    renderScheduleResult(config) {
        const schedule = config.fullRestSchedule;
        const analysis = config.manpowerAnalysis;
        const schedulePeriodConfig = Store.getSchedulePeriodConfig(config.schedulePeriodConfigId);

        if (!schedulePeriodConfig) return '';

        const startDate = schedulePeriodConfig.scheduleConfig.startDate;
        const endDate = schedulePeriodConfig.scheduleConfig.endDate;

        // 生成日期列表
        const dateList = SchedulePeriodManager.generateDateList(startDate, endDate);
        const staffData = Store.getCurrentStaffData();

        // 统计信息
        const totalAnnual = Object.values(analysis.annualLeaveUsage).reduce((sum, v) => sum + v, 0);
        const totalLegal = Object.values(analysis.legalLeaveUsage).reduce((sum, v) => sum + v, 0);
        const violationsCount = analysis.constraintViolations.length;

        let html = `
            <!-- 统计摘要 -->
            <div class="bg-white rounded-lg shadow-sm p-6 mb-4">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">统计摘要</h3>
                <div class="grid grid-cols-4 gap-4">
                    <div class="bg-blue-50 rounded-lg p-4">
                        <div class="text-sm text-gray-600">总人数</div>
                        <div class="text-2xl font-bold text-blue-700">${analysis.totalStaff}</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-4">
                        <div class="text-sm text-gray-600">年假使用</div>
                        <div class="text-2xl font-bold text-green-700">${totalAnnual}天</div>
                    </div>
                    <div class="bg-purple-50 rounded-lg p-4">
                        <div class="text-sm text-gray-600">法定休使用</div>
                        <div class="text-2xl font-bold text-purple-700">${totalLegal}天</div>
                    </div>
                    <div class="bg-red-50 rounded-lg p-4">
                        <div class="text-sm text-gray-600">约束违反</div>
                        <div class="text-2xl font-bold text-red-700">${violationsCount}条</div>
                    </div>
                </div>

                ${violationsCount > 0 ? `
                    <div class="mt-4 p-4 bg-yellow-50 rounded-lg">
                        <h4 class="text-sm font-semibold text-yellow-800 mb-2">约束违反警告</h4>
                        <div class="max-h-40 overflow-y-auto text-xs text-yellow-700">
                            ${analysis.constraintViolations.map(v => `
                                <div>• ${v.staffName}: ${v.violations.map(vi => vi.message).join(', ')}</div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- 休假排班结果（仿照个性化休假格式） -->
            <div class="bg-white rounded-lg shadow-sm p-6 mb-4">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-800">休假排班结果（可点击单元格切换类型）</h3>
                    <div class="flex gap-2">
                        <button onclick="FullRestManager.applyToPersonalRequests('${config.configId}')"
                                class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
                            应用到个性化需求
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto" style="max-height: 600px;">
                    <table class="min-w-full border-collapse" style="table-layout: fixed;">
                        <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                            <tr>
                                <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 40px; min-width: 40px;">状态</th>
                                <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 60px; min-width: 60px;">ID</th>
                                <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 70px; min-width: 70px;">姓名</th>
                                <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="width: 100px; min-width: 100px;">人员类型</th>
                                <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="width: 80px; min-width: 80px;">归属地</th>
                                ${dateList.map(dateInfo => {
                                    const dateStr = dateInfo.dateStr || (typeof dateInfo.date === 'string' ? dateInfo.date : dateInfo.date.toISOString().split('T')[0]);
                                    const isRestDay = schedulePeriodConfig.restDaysSnapshot && schedulePeriodConfig.restDaysSnapshot[dateStr];
                                    const bgColor = isRestDay ? 'bg-blue-400' : (dateInfo.isWeekend ? 'bg-yellow-50' : 'bg-gray-50');
                                    const textColor = isRestDay ? 'text-white' : (dateInfo.isWeekend ? 'text-yellow-700' : 'text-gray-700');
                                    const borderColor = isRestDay ? 'border-blue-500' : (dateInfo.isWeekend ? 'border-yellow-200' : 'border-gray-300');
                                    const day = parseInt(dateStr.split('-')[2]);
                                    const weekday = ['日','一','二','三','四','五','六'][new Date(dateStr).getDay()];
                                    return `<th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}"
                                                style="width: 30px; min-width: 30px;"
                                                title="${dateStr}">
                                        <div class="text-xs font-bold">${day}</div>
                                        <div class="text-xs">${weekday}</div>
                                    </th>`;
                                }).join('')}
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${staffData.map((staff, index) => {
                                const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                                const staffSchedule = schedule[staff.id] || {};
                                const personalRequests = Store.getPersonalRequests
                                    ? (Store.getPersonalRequests(staff.id) || {})
                                    : {};

                                // 合并：显示 personalRequests 和 staffSchedule
                                return `<tr class="${rowClass}" data-staff-id="${staff.id}">
                                    <td class="px-1 py-1 text-center border border-gray-300 align-middle">
                                        <span class="inline-block w-4 h-4"></span>
                                    </td>
                                    <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.id || staff.staffId}</td>
                                    <td class="px-1 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                                    <td class="px-1 py-1 text-center text-xs font-medium text-blue-700 border border-gray-300 bg-blue-50">${staff.personType || '未设置'}</td>
                                    <td class="px-1 py-1 text-center text-xs font-medium text-green-700 border border-gray-300 bg-green-50">${staff.region === 'shanghai' ? '上海' : '上海'}</td>
                                    ${dateList.map(dateInfo => {
                                        const dateStr = dateInfo.dateStr || (typeof dateInfo.date === 'string' ? dateInfo.date : dateInfo.date.toISOString().split('T')[0]);
                                        const existingType = personalRequests[dateStr] || '';
                                        const newType = staffSchedule[dateStr] || '';

                                        let cellContent = '';
                                        let cellClass = 'px-0.5 py-1 text-center text-xs border border-gray-300';
                                        let title = dateStr;
                                        let onclick = '';

                                        if (existingType) {
                                            // 已指定的休假（灰色只读）
                                            const bgColor = existingType === 'ANNUAL' ? 'bg-gray-300 text-gray-700' : 'bg-gray-400 text-gray-800';
                                            cellClass += ` ${bgColor} font-semibold`;
                                            cellContent = existingType === 'ANNUAL' ? '年' : '法';
                                            title += '\\n已指定休假（不可修改）';
                                        } else if (newType) {
                                            // 新分配的休假（亮色可编辑）
                                            const bgColor = newType === 'ANNUAL' ? 'bg-blue-200 text-blue-900' : 'bg-green-200 text-green-900';
                                            cellClass += ` ${bgColor} font-semibold cursor-pointer hover:opacity-80`;
                                            cellContent = newType === 'ANNUAL' ? '年' : '法';
                                            title += '\\n新分配（点击切换）';
                                            onclick = `onclick="FullRestManager.cycleVacationType('${config.configId}', '${staff.id}', '${dateStr}')"`;
                                        } else {
                                            // 无休假（可点击添加）
                                            cellClass += ' bg-white hover:bg-gray-100 cursor-pointer';
                                            cellContent = '-';
                                            title += '\\n点击添加休假';
                                            onclick = `onclick="FullRestManager.cycleVacationType('${config.configId}', '${staff.id}', '${dateStr}')"`;
                                        }

                                        return `<td class="${cellClass}" title="${title}" ${onclick}>
                                                    ${cellContent}
                                                </td>`;
                                    }).join('')}
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        return html;
    },

    /**
     * 循环切换休假类型（用于点击单元格）
     * 顺序: - → ANNUAL → LEGAL → -
     */
    async cycleVacationType(configId, staffId, dateStr) {
        const config = Store.getFullRestConfig(configId);
        if (!config || !config.fullRestSchedule) return;

        const schedule = config.fullRestSchedule;

        if (!schedule[staffId]) {
            schedule[staffId] = {};
        }

        const currentType = schedule[staffId][dateStr] || '';
        const typeCycle = ['', 'ANNUAL', 'LEGAL'];
        const currentIndex = typeCycle.indexOf(currentType);
        const newType = typeCycle[(currentIndex + 1) % typeCycle.length];

        if (newType === '') {
            delete schedule[staffId][dateStr];
        } else {
            schedule[staffId][dateStr] = newType;
        }

        Store.updateFullRestConfig(configId, { fullRestSchedule: schedule }, false);
        await this.renderConfigDetail(config);
    },

    /**
     * 生成休假分配
     */
    async generateSchedule(configId) {
        try {
            const config = Store.getFullRestConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }

            // 获取排班周期配置
            const schedulePeriodConfig = Store.getSchedulePeriodConfig(config.schedulePeriodConfigId);
            if (!schedulePeriodConfig) {
                alert('未关联排班周期配置');
                return;
            }

            // 计算排班周期统计
            const periodStats = SchedulePeriodManager.calculatePeriodStats(schedulePeriodConfig);
            const totalRestDays = periodStats.totalRestDays;

            // 获取已排大夜数据
            const nightSchedule = typeof NightShiftManager !== 'undefined'
                ? (NightShiftManager.currentSchedule || {})
                : {};

            // 准备求解器参数
            const params = {
                staffData: Store.getCurrentStaffData(),
                scheduleConfig: schedulePeriodConfig.scheduleConfig,
                restDaysSnapshot: schedulePeriodConfig.restDaysSnapshot || {},
                nightSchedule: this.transformNightSchedule(nightSchedule),
                totalRestDays,
                yearMonth: `${schedulePeriodConfig.scheduleConfig.year}${String(schedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`,
                constraints: Store.getFullRestConfig(configId).constraints
            };

            console.log('[FullRestManager] 开始生成休假分配...', params);

            // 调用求解器
            const result = await FullRestSolver.solve(params);

            if (!result.isValid) {
                alert('生成失败:\n' + result.errors.join('\n'));
                return;
            }

            // 保存结果
            Store.updateFullRestConfig(configId, {
                fullRestSchedule: result.schedule,
                manpowerAnalysis: result.analysis,
                generatedAt: new Date().toISOString()
            });

            await Store.saveState();

            // 显示结果
            await this.renderConfigDetail(Store.getFullRestConfig(configId));

            if (result.warnings.length > 0) {
                alert('生成完成，但有警告:\n' + result.warnings.join('\n'));
            } else {
                alert('生成成功！');
            }
        } catch (error) {
            console.error('[FullRestManager] 生成失败:', error);
            alert('生成失败: ' + error.message);
        }
    },

    /**
     * 转换大夜排班数据格式
     */
    transformNightSchedule(nightSchedule) {
        // NightShiftManager.currentSchedule 格式: { dateStr: [assignments...] }
        // 转换为: { staffId: { dateStr: true } }
        const transformed = {};

        for (const dateStr in nightSchedule) {
            const assignments = nightSchedule[dateStr];
            assignments.forEach(assignment => {
                if (!transformed[assignment.staffId]) {
                    transformed[assignment.staffId] = {};
                }
                transformed[assignment.staffId][dateStr] = true;
            });
        }

        return transformed;
    },

    /**
     * 更新休假类型（手动调整）
     */
    async updateVacationType(configId, staffId, dateStr, newType) {
        const config = Store.getFullRestConfig(configId);
        if (!config || !config.fullRestSchedule) return;

        const schedule = config.fullRestSchedule;

        if (!schedule[staffId]) {
            schedule[staffId] = {};
        }

        if (newType === '') {
            delete schedule[staffId][dateStr];
        } else {
            schedule[staffId][dateStr] = newType;
        }

        Store.updateFullRestConfig(configId, { fullRestSchedule: schedule }, false);
        await this.renderConfigDetail(config);
    },

    /**
     * 应用到个性化需求
     */
    async applyToPersonalRequests(configId) {
        if (!confirm('确定要应用到个性化休假需求吗？这将更新 personalRequests 数据。')) {
            return;
        }

        const config = Store.getFullRestConfig(configId);
        if (!config || !config.fullRestSchedule) {
            alert('请先生成休假分配');
            return;
        }

        const schedule = config.fullRestSchedule;
        const personalRequests = Store.getAllPersonalRequests
            ? (Store.getAllPersonalRequests() || {})
            : {};

        // 合并到 personalRequests
        for (const staffId in schedule) {
            if (!personalRequests[staffId]) {
                personalRequests[staffId] = {};
            }

            for (const dateStr in schedule[staffId]) {
                const type = schedule[staffId][dateStr];
                if (type === 'ANNUAL' || type === 'LEGAL') {
                    personalRequests[staffId][dateStr] = type;
                }
            }
        }

        Store.updateState({ personalRequests: personalRequests }, false);
        await Store.saveState();

        alert('已应用到个性化休假需求');
    },

    /**
     * 激活配置
     */
    async activateConfig(configId) {
        const config = Store.getFullRestConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }
        const chainContext = this.getActivationChainContext(config);
        if (!chainContext.ok) {
            alert(chainContext.message);
            return;
        }
        await Store.setActiveFullRestConfig(configId);
        await this.showFullRestManagement();
    },

    /**
     * 取消激活配置
     */
    async deactivateConfig() {
        if (!Store.getState('activeFullRestConfigId')) {
            alert('当前没有激活的全量休息配置');
            return;
        }
        if (!confirm('确定要取消激活当前全量休息配置吗？')) return;

        if (typeof Store.clearActiveFullRestConfig !== 'function') {
            throw new Error('Store.clearActiveFullRestConfig 不可用');
        }
        await Store.clearActiveFullRestConfig();
        await this.showFullRestManagement();
    },

    /**
     * 删除配置
     */
    async deleteConfig(configId) {
        if (!confirm('确定要删除该配置吗？')) return;

        Store.deleteFullRestConfig(configId);
        await Store.saveState();
        await this.showFullRestManagement();
    },

    /**
     * 重命名配置
     */
    async editConfigName(configId) {
        const config = Store.getFullRestConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const newName = prompt('请输入新的配置名称：', config.name);
        if (!newName || newName.trim() === '') return;

        Store.updateFullRestConfig(configId, { name: newName.trim() });
        await Store.saveState();
        this.renderConfigList();
    },

    /**
     * 复制配置
     */
    async duplicateConfig(configId) {
        try {
            const config = Store.getFullRestConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }
            alert('当前锁仅允许一条全量休息配置，暂不支持复制。请直接编辑当前配置。');
            return;
        } catch (error) {
            console.error('[FullRestManager] 复制配置失败:', error);
            alert('复制失败: ' + error.message);
        }
    },

    /**
     * 导出配置
     */
    async exportConfig(configId) {
        try {
            const config = Store.getFullRestConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }

            // 导出配置数据（不包含 fullRestSchedule，因为数据量大）
            const exportData = {
                name: config.name,
                schedulePeriodConfigId: config.schedulePeriodConfigId,
                constraints: config.constraints,
                exportedAt: new Date().toISOString()
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${config.name}_配置.json`;
            link.click();
            URL.revokeObjectURL(url);

            console.log('[FullRestManager] 配置已导出');
        } catch (error) {
            console.error('[FullRestManager] 导出配置失败:', error);
            alert('导出失败: ' + error.message);
        }
    },

    /**
     * 导入配置
     */
    async importConfig() {
        console.log('[FullRestManager] importConfig 被调用');
        try {
            const chainContext = this.getActivationChainContext();
            if (!chainContext.ok) {
                alert(chainContext.message);
                return;
            }
            const activeSchedulePeriodConfigId = chainContext.activeSchedulePeriodConfigId;
            const selectedCityScope = this.normalizeCityScope(chainContext.activeCityScope);

            // 创建隐藏的文件输入框
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';

            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const importData = JSON.parse(text);

                    // 验证导入数据
                    if (!importData.name || !importData.constraints) {
                        alert('导入文件格式不正确');
                        return;
                    }

                    // 检查是否激活了排班周期配置
                    const chainContext = this.getActivationChainContext();
                    if (!chainContext.ok) {
                        alert(chainContext.message);
                        return;
                    }
                    const activeSchedulePeriodConfig = chainContext.activeSchedulePeriodConfig;
                    const targetCityScope = this.normalizeCityScope(selectedCityScope);
                    const yearMonth = (activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig)
                        ? `${activeSchedulePeriodConfig.scheduleConfig.year}${String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`
                        : null;
                    if (yearMonth) {
                        const existing = this.findExistingConfigInCurrentLock();
                        if (existing) {
                            alert(`当前激活锁已存在配置：${existing.name}。请先删除后再导入。`);
                            return;
                        }
                    }

                    // 创建新配置
                    const configId = Store.createFullRestConfig(
                        importData.name,
                        activeSchedulePeriodConfigId,
                        importData.constraints,
                        targetCityScope
                    );

                    await Store.saveState();
                    await this.viewConfig(configId);

                    alert('导入成功！');
                } catch (error) {
                    console.error('[FullRestManager] 导入失败:', error);
                    alert('导入失败：' + error.message);
                }
            };

            // 触发文件选择
            document.body.appendChild(fileInput);
            fileInput.click();
        } catch (error) {
            console.error('[FullRestManager] importConfig 失败:', error);
            alert('导入失败：' + error.message);
        }
    },

    /**
     * 返回列表
     */
    async backToList() {
        await this.showFullRestManagement();
    },

    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.FullRestManager = FullRestManager;
}
