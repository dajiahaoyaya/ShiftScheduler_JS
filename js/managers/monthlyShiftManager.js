/**
 * 月度班次配置管理器
 * 负责月度班次配置的显示和管理
 * 参照 RequestManager (vacationManager.js) 的结构
 */

const MonthlyShiftManager = {
    currentView: 'configs', // 'configs' | 'entry'
    currentConfigId: null, // 当前查看的配置ID
    editingConfig: null, // 当前编辑的配置

    // 班次列表
    SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2'],

    /**
     * 显示月度班次配置管理页面（配置记录列表）
     */
    async showMonthlyShiftManagement() {
        // 检查 Store 是否已加载
        if (typeof Store === 'undefined') {
            console.error('MonthlyShiftManager.showMonthlyShiftManagement: Store 未定义');
            alert('系统初始化未完成，请刷新页面重试');
            return;
        }

        this.currentView = 'configs';
        this.currentConfigId = null;

        // 保存视图状态到Store
        Store.updateState({
            currentView: 'monthlyShift',
            currentSubView: 'configs',
            currentConfigId: null
        }, false);

        // 更新标题
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '月度班次配置';
        }

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        // 渲染配置列表页面
        await this.renderConfigsList(scheduleTable);
    },

    /**
     * 渲染配置列表页面
     */
    async renderConfigsList(container) {
        // 加载所有配置
        let configs = [];
        try {
            // 从 Store 加载
            configs = Store.getMonthlyShiftConfigs();

            // 如果 Store 中没有，尝试从 IndexedDB 加载
            if (configs.length === 0) {
                configs = await DB.loadAllMonthlyShiftConfigs();
                // 同步到 Store
                if (configs.length > 0) {
                    if (typeof Store.replaceMonthlyShiftConfigs === 'function') {
                        Store.replaceMonthlyShiftConfigs(configs, false, { actorEmpNo: 'SYSTEM_MIGRATION' });
                    } else {
                        Store.updateState({ monthlyShiftConfigs: configs }, false);
                    }
                }
            }
        } catch (error) {
            console.error('加载月度班次配置失败:', error);
            configs = [];
        }

        // 获取当前激活的配置ID
        const activeConfigId = Store.getState('activeMonthlyShiftConfigId');

        // 生成HTML
        container.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">月度班次配置管理</h2>
                    <button onclick="MonthlyShiftManager.createNewConfig()"
                        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 4v16m8-8H4"></path>
                        </svg>
                        <span>创建新配置</span>
                    </button>
                </div>

                ${configs.length === 0 ? `
                    <div class="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <h3 class="text-lg font-semibold text-gray-700 mb-2">暂无月度班次配置</h3>
                        <p class="text-gray-500 mb-4">创建您的第一个月度班次配置，为员工分配月度班次</p>
                        <button onclick="MonthlyShiftManager.createNewConfig()"
                            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            创建配置
                        </button>
                    </div>
                ` : `
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${configs.map(config => `
                            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow
                                ${activeConfigId === config.configId ? 'ring-2 ring-blue-500' : ''}">
                                <div class="flex justify-between items-start mb-3">
                                    <h3 class="text-lg font-semibold text-gray-800 truncate flex-1">${this.escapeHtml(config.name)}</h3>
                                    ${activeConfigId === config.configId ? `
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
                                        ${config.schedulePeriod || '未设置周期'}
                                    </p>
                                    <p class="flex items-center">
                                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                                        </svg>
                                        已分配: ${Object.keys(config.monthlyShifts || {}).length} 人
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
                                        <button onclick="MonthlyShiftManager.viewMonthlyShiftEntry('${config.configId}')"
                                            class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                                            查看/编辑
                                        </button>
                                        ${activeConfigId !== config.configId ? `
                                            <button onclick="MonthlyShiftManager.activateConfig('${config.configId}')"
                                                class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                                                激活
                                            </button>
                                        ` : `
                                            <button onclick="MonthlyShiftManager.deactivateConfig()"
                                                class="px-3 py-1.5 text-sm bg-gray-400 text-white rounded hover:bg-gray-500">
                                                取消激活
                                            </button>
                                        `}
                                    </div>
                                    <button onclick="MonthlyShiftManager.deleteConfig('${config.configId}')"
                                        class="p-1.5 text-red-600 hover:bg-red-50 rounded" title="删除配置">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    },

    /**
     * 获取与「大夜管理和配置页面」一致的大夜数据，统计每位员工的大夜天数（不含休整期）。
     * 数据源优先级：NightShiftManager.currentSchedule -> DB.loadNightShiftSchedule('current') -> 激活的大夜配置。
     * 支持两种 schedule 格式：日期格式 { dateStr: [{ staffId, shiftType, isPostShiftRest }] } 与旧格式 { staffId: { dateStr: 'NIGHT'|'rest' } }。
     * @returns {Promise<Object>} { [staffId]: number } 每位员工的大夜天数
     */
    async getNightShiftCountByStaff() {
        const countByStaff = {};
        const addNight = (staffId) => {
            countByStaff[staffId] = (countByStaff[staffId] || 0) + 1;
        };
        const applySchedule = (schedule) => {
            if (!schedule || typeof schedule !== 'object') return;
            const firstKey = Object.keys(schedule)[0];
            if (firstKey == null) return;
            const firstVal = schedule[firstKey];
            const isDateFormat = Array.isArray(firstVal);
            if (isDateFormat) {
                Object.keys(schedule).forEach(dateStr => {
                    const assignments = schedule[dateStr] || [];
                    (assignments || []).forEach(a => {
                        if (a && a.staffId && a.shiftType !== 'rest' && !a.isPostShiftRest) {
                            addNight(a.staffId);
                        }
                    });
                });
            } else {
                Object.keys(schedule).forEach(staffId => {
                    const staffSchedule = schedule[staffId];
                    if (staffSchedule && typeof staffSchedule === 'object') {
                        Object.keys(staffSchedule).forEach(dateStr => {
                            const v = staffSchedule[dateStr];
                            if (v === 'night' || v === 'NIGHT') addNight(staffId);
                        });
                    }
                });
            }
        };

        if (typeof NightShiftManager !== 'undefined' && NightShiftManager.currentSchedule && Object.keys(NightShiftManager.currentSchedule).length > 0) {
            console.log('[MonthlyShiftManager] 从 NightShiftManager.currentSchedule 读取大夜数据');
            applySchedule(NightShiftManager.currentSchedule);
        }
        if (Object.keys(countByStaff).length === 0 && typeof DB !== 'undefined' && typeof DB.loadNightShiftSchedule === 'function') {
            try {
                const data = await DB.loadNightShiftSchedule('current');
                if (data && data.schedule && Object.keys(data.schedule).length > 0) {
                    console.log('[MonthlyShiftManager] 从 DB 当前大夜排班读取大夜数据');
                    applySchedule(data.schedule);
                }
            } catch (e) {
                console.warn('[MonthlyShiftManager] 读取 DB 大夜排班失败:', e);
            }
        }
        if (Object.keys(countByStaff).length === 0) {
            const activeNightShiftConfigId = Store.getState('activeNightShiftConfigId');
            if (activeNightShiftConfigId) {
                try {
                    const config = Store.getNightShiftConfig
                        ? Store.getNightShiftConfig(activeNightShiftConfigId)
                        : null;
                    const schedule = config && config.schedule;
                    if (schedule && Object.keys(schedule).length > 0) {
                        console.log('[MonthlyShiftManager] 从激活的大夜配置读取大夜数据');
                        applySchedule(schedule);
                    } else if (typeof DB !== 'undefined' && typeof DB.loadNightShiftConfigManagement === 'function') {
                        const dbConfig = await DB.loadNightShiftConfigManagement(activeNightShiftConfigId);
                        if (dbConfig && dbConfig.schedule && Object.keys(dbConfig.schedule).length > 0) {
                            console.log('[MonthlyShiftManager] 从 DB 激活大夜配置读取大夜数据');
                            applySchedule(dbConfig.schedule);
                        }
                    }
                } catch (e) {
                    console.warn('[MonthlyShiftManager] 从激活大夜配置读取失败:', e);
                }
            }
        }
        return countByStaff;
    },

    /**
     * 创建新配置
     */
    async createNewConfig() {
        // 检查是否有激活的人员配置
        const staffConfigs = Store.getStaffConfigs();
        const activeStaffConfigId = Store.getState('activeConfigId');

        if (!activeStaffConfigId || staffConfigs.length === 0) {
            alert('请先激活人员配置，然后再创建月度班次配置');
            return;
        }

        // 获取激活的人员配置
        const activeConfig = staffConfigs.find(c => c.configId === activeStaffConfigId);
        if (!activeConfig || !activeConfig.staffDataSnapshot) {
            alert('无法获取人员数据，请重新激活人员配置');
            return;
        }

        // 获取排班周期信息
        const schedulePeriodConfig = Store.getActiveSchedulePeriodConfig();
        if (!schedulePeriodConfig) {
            alert('请先设置排班周期');
            return;
        }

        const schedulePeriod = schedulePeriodConfig.schedulePeriod || `${schedulePeriodConfig.scheduleConfig.startDate} 至 ${schedulePeriodConfig.scheduleConfig.endDate}`;

        // 生成默认配置名称
        const defaultName = `${schedulePeriod} 班次配置`;

        // 创建空配置
        const configId = Store.createMonthlyShiftConfig(defaultName, {}, schedulePeriod);

        // 自动导入大夜排班和休假数据（与已激活的大夜管理/配置页面数据源一致）
        try {
            // 获取大夜排班：优先 NightShiftManager.currentSchedule，再 DB current，最后激活的大夜配置
            const nightShiftCountByStaff = await this.getNightShiftCountByStaff();

            // 获取个性化休假数据
            const personalRequests = Store.getAllPersonalRequests() || {};
            console.log('[MonthlyShiftManager] 个性化休假数据已加载');

            // 获取休息日配置
            const restDays = Store.getAllRestDays() || {};

            // 根据大夜排班和休假自动分配班次
            const monthlyShifts = {};
            const staffDataList = activeConfig.staffDataSnapshot || [];

            staffDataList.forEach(staff => {
                const staffId = staff.id;
                const nightShiftCount = nightShiftCountByStaff[staffId] || 0;

                // 统计该员工的休假天数
                let vacationDays = 0;
                if (personalRequests[staffId]) {
                    vacationDays = Object.keys(personalRequests[staffId]).length;
                }

                // 根据规则自动分配班次
                let assignedShift = null;
                
                if (nightShiftCount > 0) {
                    // 有大夜排班的员工，分配为A1班
                    assignedShift = 'A1';
                } else if (vacationDays >= 5) {
                    // 休假5天以上的员工，分配为A2班
                    assignedShift = 'A2';
                } else if (vacationDays >= 3) {
                    // 休假3-4天的员工，分配为A班
                    assignedShift = 'A';
                } else if (vacationDays >= 1) {
                    // 有休假的员工，分配为B1班
                    assignedShift = 'B1';
                } else {
                    // 无大夜和休假的员工，分配为B2班
                    assignedShift = 'B2';
                }

                monthlyShifts[staffId] = assignedShift;
                console.log(`[MonthlyShiftManager] 员工 ${staffId} (${staff.name}): 大夜${nightShiftCount}天, 休假${vacationDays}天 -> 分配${assignedShift}班`);
            });

            // 更新配置
            Store.updateMonthlyShiftConfig(configId, {
                monthlyShifts: monthlyShifts
            }, true);

            console.log('[MonthlyShiftManager] 自动导入完成，共分配', Object.keys(monthlyShifts).length, '名员工');
        } catch (error) {
            console.error('[MonthlyShiftManager] 自动导入数据失败:', error);
            alert('自动导入数据失败，但配置已创建，可以手动编辑');
        }

        // 保存到 IndexedDB
        try {
            const config = Store.getMonthlyShiftConfig(configId);
            await DB.saveMonthlyShiftConfig(config);
        } catch (error) {
            console.error('保存配置到数据库失败:', error);
        }

        // 跳转到编辑页面
        this.viewMonthlyShiftEntry(configId);
    },

    /**
     * 查看班次录入页面
     */
    async viewMonthlyShiftEntry(configId) {
        this.currentView = 'entry';
        this.currentConfigId = configId;

        // 保存视图状态
        Store.updateState({
            currentSubView: 'entry',
            currentConfigId: configId
        }, false);

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        // 加载配置数据
        const config = Store.getMonthlyShiftConfig(configId);
        if (!config) {
            alert('配置不存在');
            this.showMonthlyShiftManagement();
            return;
        }

        this.editingConfig = config;

        // 渲染班次录入页面
        await this.renderShiftEntryPage(scheduleTable, config);
    },

    /**
     * 渲染班次录入页面
     */
    async renderShiftEntryPage(container, config) {
        // 获取员工数据
        const staffConfigs = Store.getStaffConfigs();
        const activeStaffConfigId = Store.getState('activeConfigId');
        const activeConfig = staffConfigs.find(c => c.configId === activeStaffConfigId);
        const staffDataList = activeConfig?.staffDataSnapshot || [];

        // 统计各班次人数
        const shiftStats = {};
        this.SHIFT_TYPES.forEach(shift => shiftStats[shift] = 0);
        Object.values(config.monthlyShifts || {}).forEach(shift => {
            if (shiftStats.hasOwnProperty(shift)) {
                shiftStats[shift]++;
            }
        });

        container.innerHTML = `
            <div class="p-6">
                <!-- 顶部工具栏 -->
                <div class="flex justify-between items-center mb-6">
                    <div class="flex items-center space-x-4">
                        <button onclick="MonthlyShiftManager.backToConfigList()"
                            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                            </svg>
                            返回列表
                        </button>
                        <h2 class="text-2xl font-bold text-gray-800">${this.escapeHtml(config.name)}</h2>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="MonthlyShiftManager.saveConfig()"
                            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                            保存配置
                        </button>
                    </div>
                </div>

                <!-- 班次统计面板 -->
                <div class="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">班次分配统计</h3>
                    <div class="flex flex-wrap gap-4">
                        ${this.SHIFT_TYPES.map(shift => `
                            <div class="flex items-center space-x-2">
                                <span class="px-3 py-1 rounded-full text-sm font-medium
                                    ${shift === 'A1' ? 'bg-indigo-100 text-indigo-800' : ''}
                                    ${shift === 'A' ? 'bg-blue-100 text-blue-800' : ''}
                                    ${shift === 'A2' ? 'bg-green-100 text-green-800' : ''}
                                    ${shift === 'B1' ? 'bg-yellow-100 text-yellow-800' : ''}
                                    ${shift === 'B2' ? 'bg-red-100 text-red-800' : ''}">
                                    ${shift}
                                </span>
                                <span class="text-sm text-gray-600">${shiftStats[shift]} 人</span>
                            </div>
                        `).join('')}
                        <div class="flex items-center space-x-2">
                            <span class="px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-600">
                                未分配
                            </span>
                            <span class="text-sm text-gray-600">${staffDataList.length - Object.keys(config.monthlyShifts || {}).length} 人</span>
                        </div>
                    </div>
                </div>

                <!-- 员工班次表格 -->
                <div class="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                    <div class="p-4 border-b border-gray-200 bg-gray-50">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-semibold text-gray-800">员工班次分配</h3>
                            <div class="flex items-center space-x-4">
                                <label class="text-sm text-gray-600">筛选:</label>
                                <select id="filterType" class="px-3 py-1 border border-gray-300 rounded text-sm"
                                    onchange="MonthlyShiftManager.filterStaffList()">
                                    <option value="">全部类型</option>
                                    <option value="正式员工">正式员工</option>
                                    <option value="外包员工">外包员工</option>
                                </select>
                                <select id="filterLocation" class="px-3 py-1 border border-gray-300 rounded text-sm"
                                    onchange="MonthlyShiftManager.filterStaffList()">
                                    <option value="">全部地点</option>
                                    <option value="上海">上海</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">姓名</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">归属地</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">当前班次</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody id="staffListBody" class="bg-white divide-y divide-gray-200">
                                ${this.renderStaffRows(staffDataList, config.monthlyShifts || {}, '', '')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染员工列表行
     */
    renderStaffRows(staffList, monthlyShifts, filterType, filterLocation) {
        return staffList
            .filter(staff => {
                if (filterType && staff.type !== filterType) return false;
                if (filterLocation && staff.location !== filterLocation) return false;
                return true;
            })
            .map(staff => {
                const currentShift = monthlyShifts[staff.id] || null;
                return `
                    <tr class="hover:bg-gray-50" data-staff-id="${staff.id}" data-staff-type="${staff.type}" data-staff-location="${staff.location}">
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${this.escapeHtml(staff.id)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${this.escapeHtml(staff.name)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${this.escapeHtml(staff.type)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${this.escapeHtml(staff.location)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-center">
                            ${currentShift ? `
                                <span class="px-3 py-1 rounded-full text-sm font-medium
                                    ${currentShift === 'A1' ? 'bg-indigo-100 text-indigo-800' : ''}
                                    ${currentShift === 'A' ? 'bg-blue-100 text-blue-800' : ''}
                                    ${currentShift === 'A2' ? 'bg-green-100 text-green-800' : ''}
                                    ${currentShift === 'B1' ? 'bg-yellow-100 text-yellow-800' : ''}
                                    ${currentShift === 'B2' ? 'bg-red-100 text-red-800' : ''}">
                                    ${currentShift}
                                </span>
                            ` : `
                                <span class="px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-600">
                                    未分配
                                </span>
                            `}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-center">
                            <select onchange="MonthlyShiftManager.assignShift('${staff.id}', this.value)"
                                class="px-3 py-1 border border-gray-300 rounded text-sm">
                                <option value="">选择班次</option>
                                ${this.SHIFT_TYPES.map(shift => `
                                    <option value="${shift}" ${currentShift === shift ? 'selected' : ''}>${shift}</option>
                                `).join('')}
                                <option value="" ${!currentShift ? 'selected' : ''}>清除</option>
                            </select>
                        </td>
                    </tr>
                `;
            }).join('');
    },

    /**
     * 筛选员工列表
     */
    filterStaffList() {
        const filterType = document.getElementById('filterType').value;
        const filterLocation = document.getElementById('filterLocation').value;

        // 获取员工数据
        const staffConfigs = Store.getStaffConfigs();
        const activeStaffConfigId = Store.getState('activeConfigId');
        const activeConfig = staffConfigs.find(c => c.configId === activeStaffConfigId);
        const staffDataList = activeConfig?.staffDataSnapshot || [];

        // 重新渲染员工列表
        const tbody = document.getElementById('staffListBody');
        if (tbody) {
            tbody.innerHTML = this.renderStaffRows(staffDataList, this.editingConfig.monthlyShifts || {}, filterType, filterLocation);
        }
    },

    /**
     * 为员工分配班次
     */
    assignShift(staffId, shiftType) {
        if (!this.editingConfig) return;

        if (!shiftType) {
            // 清除班次
            delete this.editingConfig.monthlyShifts[staffId];
        } else {
            // 分配班次
            this.editingConfig.monthlyShifts[staffId] = shiftType;
        }

        // 重新渲染当前页面
        this.renderShiftEntryPage(document.getElementById('scheduleTable'), this.editingConfig);
    },

    /**
     * 保存配置
     */
    async saveConfig() {
        if (!this.editingConfig) return;

        try {
            // 更新配置
            Store.updateMonthlyShiftConfig(this.editingConfig.configId, {
                monthlyShifts: this.editingConfig.monthlyShifts,
                updatedAt: new Date().toISOString()
            }, true);

            // 保存到 IndexedDB
            const config = Store.getMonthlyShiftConfig(this.editingConfig.configId);
            await DB.saveMonthlyShiftConfig(config);

            alert('配置保存成功');
        } catch (error) {
            console.error('保存配置失败:', error);
            alert('保存失败: ' + error.message);
        }
    },

    /**
     * 激活配置
     */
    async activateConfig(configId) {
        try {
            await Store.setActiveMonthlyShiftConfig(configId);
            alert('配置已激活');
            await this.renderConfigsList(document.getElementById('scheduleTable'));
        } catch (error) {
            console.error('激活配置失败:', error);
            alert('激活失败: ' + error.message);
        }
    },

    /**
     * 取消激活配置
     */
    async deactivateConfig() {
        if (!confirm('确定要取消激活当前配置吗？')) return;

        try {
            await Store.clearActiveMonthlyShiftConfig();
            alert('已取消激活');
            await this.renderConfigsList(document.getElementById('scheduleTable'));
        } catch (error) {
            console.error('取消激活失败:', error);
            alert('取消激活失败: ' + error.message);
        }
    },

    /**
     * 删除配置
     */
    async deleteConfig(configId) {
        if (!confirm('确定要删除此配置吗？此操作不可恢复。')) return;

        try {
            // 从 IndexedDB 删除
            await DB.deleteMonthlyShiftConfig(configId);

            // 从 Store 删除
            Store.deleteMonthlyShiftConfig(configId);

            alert('配置已删除');
            await this.renderConfigsList(document.getElementById('scheduleTable'));
        } catch (error) {
            console.error('删除配置失败:', error);
            alert('删除失败: ' + error.message);
        }
    },

    /**
     * 返回配置列表
     */
    async backToConfigList() {
        await this.showMonthlyShiftManagement();
    },

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// 暴露到全局
window.MonthlyShiftManager = MonthlyShiftManager;
