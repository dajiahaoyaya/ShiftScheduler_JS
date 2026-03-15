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

    // 班别列表（一个月只允许一个班别）
    SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2'],

    // 技能列表（用于随机均衡填充）
    SKILL_TYPES: ['星', '综', '收', '网', '天', '微', '银B', '追', '毛'],

    // 月度班次筛选状态（与个性化需求分离）
    monthlyFilterState: null,

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
        let configs = Store.getMonthlyScheduleConfigs ? Store.getMonthlyScheduleConfigs() : [];

        // 如果 Store 中没有配置，尝试从 IndexedDB 加载
        if (configs.length === 0) {
            try {
                const dbConfigs = await DB.loadAllMonthlyScheduleConfigs();
                if (dbConfigs && dbConfigs.length > 0) {
                    // 同步到 Store
                    Store.state.monthlyScheduleConfigs = dbConfigs;
                    configs = dbConfigs;
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

        // 过滤当前周期的配置
        const filteredConfigs = configs.filter(config => {
            if (!currentYearMonth || !config.scheduleConfig) return true;
            const configYearMonth = `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}`;
            return configYearMonth === currentYearMonth;
        });

        let html = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">本月排班配置管理</h2>
                    <div class="flex space-x-3">
                        <button onclick="MonthlyScheduleConfigManager.createNewConfig()"
                            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                            </svg>
                            <span>新建配置</span>
                        </button>
                    </div>
                </div>

                <div class="mb-4">
                    <p class="text-sm text-gray-600">当前排班周期: ${currentYearMonth || '未设置'}</p>
                </div>
        `;

        if (filteredConfigs.length === 0) {
            html += `
                <div class="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <h3 class="text-lg font-semibold text-gray-700 mb-2">暂无本月排班配置</h3>
                    <p class="text-gray-500 mb-4">创建本月排班配置，为员工分配每日班次和技能</p>
                    <button onclick="MonthlyScheduleConfigManager.createNewConfig()"
                        class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
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
                            <span class="text-sm font-medium text-gray-900">${config.name}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${staffCount} 人</td>
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
                                    <button onclick="MonthlyScheduleConfigManager.activateConfig('${config.configId}')"
                                        class="text-blue-600 hover:text-blue-800 font-medium">
                                        激活
                                    </button>
                                ` : ''}
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
            // 检查是否有激活的排班周期配置
            const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
            if (!activeSchedulePeriodConfigId) {
                alert('请先创建并激活一个排班周期配置');
                return;
            }

            const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            if (!activeSchedulePeriodConfig) {
                alert('未找到激活的排班周期配置');
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
                staffScheduleData[staffId] = {
                    staffId: staffId,
                    staffName: staff.staffName || staff.name,
                    shiftType: this.getRandomShiftType(), // 随机分配班别
                    dailySchedule: {} // 每日排班数据
                };
            });

            // 保存排班周期信息
            const schedulePeriod = activeSchedulePeriodConfig.schedulePeriod ||
                `${activeSchedulePeriodConfig.scheduleConfig.startDate} 至 ${activeSchedulePeriodConfig.scheduleConfig.endDate}`;

            // 生成配置ID
            const configId = `monthly_schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 创建完整的配置数据
            const configData = {
                configId: configId,
                name: name,
                schedulePeriod: schedulePeriod,
                scheduleConfig: {
                    startDate: activeSchedulePeriodConfig.scheduleConfig.startDate,
                    endDate: activeSchedulePeriodConfig.scheduleConfig.endDate,
                    year: activeSchedulePeriodConfig.scheduleConfig.year,
                    month: activeSchedulePeriodConfig.scheduleConfig.month
                },
                staffScheduleData: staffScheduleData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // 保存到Store
            if (!Store.state.monthlyScheduleConfigs) {
                Store.state.monthlyScheduleConfigs = [];
            }
            Store.state.monthlyScheduleConfigs.push(configData);

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
            const configs = Store.state.monthlyScheduleConfigs || [];
            const config = configs.find(c => c.configId === configId);

            if (!config) {
                alert('配置不存在');
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

        const configs = Store.state.monthlyScheduleConfigs || [];
        const config = configs.find(c => c.configId === configId);

        if (config && config.staffScheduleData && config.staffScheduleData[staffId]) {
            config.staffScheduleData[staffId].shiftType = newShiftType;
            config.updatedAt = new Date().toISOString();

            // 保存到IndexedDB
            await DB.saveMonthlyScheduleConfig(config);
            
            // 保存Store状态
            await Store.saveState();

            updateStatus('班别已更新', 'success');
        }
    },

    /**
     * 更新技能
     */
    async updateSkill(configId, staffId, dateStr, newSkill) {
        console.log('更新技能:', staffId, dateStr, newSkill);

        const configs = Store.state.monthlyScheduleConfigs || [];
        const config = configs.find(c => c.configId === configId);

        if (config && config.staffScheduleData && config.staffScheduleData[staffId]) {
            config.staffScheduleData[staffId].dailySchedule[dateStr] = newSkill;
            config.updatedAt = new Date().toISOString();

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
            await Store.setActiveMonthlyScheduleConfig(configId);
            await this.renderConfigList(document.getElementById('scheduleTable'));
            updateStatus('配置已激活', 'success');
        } catch (error) {
            alert('激活失败：' + error.message);
        }
    },

    /**
     * 删除配置
     */
    async deleteConfig(configId) {
        const configs = Store.state.monthlyScheduleConfigs || [];
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
            // 从Store中删除
            Store.state.monthlyScheduleConfigs = configs.filter(c => c.configId !== configId);

            // 如果删除的是激活的配置，清除激活状态
            if (isActive) {
                Store.state.activeMonthlyScheduleConfigId = null;
            }

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
        await this.showMonthlyScheduleConfigManagement();
    },

    /**
     * 获取当前配置
     */
    getCurrentConfig() {
        if (!this.currentConfigId) {
            return null;
        }
        const configs = Store.state.monthlyScheduleConfigs || [];
        return configs.find(c => c.configId === this.currentConfigId) || null;
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
            locations: ['上海'],
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
     * 切换归属地全部选择（仅上海，保留函数以兼容旧调用）
     */
    toggleLocationFilterAll(checkbox) {
        // 归属地固定为上海，无需操作
        this.updateLocationFilter();
    },

    /**
     * 更新归属地筛选
     */
    updateLocationFilter() {
        const filterState = this.getMonthlyFilterState();
        // 归属地固定为上海，无需筛选
        filterState.locations = ['上海'];
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
        _isUpdatingMonthlyScheduleDisplay = true;

        try {
            const scheduleTable = document.getElementById('scheduleTable');
            const scheduleConfig = Store.getState('scheduleConfig');

            if (!scheduleTable) {
                console.warn('updateMonthlyScheduleDisplay: scheduleTable 未找到');
                return;
            }
            if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-gray-400">
                        <p>请先配置排班周期</p>
                    </div>
                `;
                return;
            }

            const config = this.getCurrentConfig();
            if (!config) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-gray-400">
                        <p>未找到月度班次配置，请返回配置列表重试</p>
                    </div>
                `;
                return;
            }

            const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
            const allStaffData = Store.getCurrentStaffData() || [];

            if (allStaffData.length === 0) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-gray-400">
                        <p>请先上传人员数据</p>
                    </div>
                `;
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
                        shiftType: this.getRandomShiftType(),
                        dailySchedule: {}
                    };
                } else if (!config.staffScheduleData[staffId].dailySchedule) {
                    config.staffScheduleData[staffId].dailySchedule = {};
                }
            });

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

            // 读取大夜排班（优先从激活的大夜配置读取，再尝试当前结果和DB）
            // 【修复】同时记录大夜和休整期，区分类型: 'night' 或 'rest'
            const nightShiftMap = {};
            const applyNightSchedule = (schedule) => {
                if (!schedule) return;
                Object.keys(schedule).forEach(dateStr => {
                    const assignments = schedule[dateStr] || [];
                    assignments.forEach(assignment => {
                        const shiftType = assignment.shiftType || 'night';
                        const isPostShiftRest = assignment.isPostShiftRest || false;
                        
                        // 判断是大夜还是休整期
                        let type = 'night';
                        if (shiftType === 'rest' || isPostShiftRest) {
                            type = 'rest'; // 休整期
                        }
                        
                        if (!nightShiftMap[assignment.staffId]) {
                            nightShiftMap[assignment.staffId] = {};
                        }
                        nightShiftMap[assignment.staffId][dateStr] = type; // 记录类型：'night' 或 'rest'
                    });
                });
            };
            
            // 优先从激活的大夜配置读取
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
            
            // 如果激活配置没有数据，尝试从 NightShiftManager.currentSchedule 读取
            if (Object.keys(nightShiftMap).length === 0 && typeof NightShiftManager !== 'undefined' && NightShiftManager.currentSchedule) {
                console.log('[MonthlyScheduleConfigManager] 从 NightShiftManager.currentSchedule 读取排班数据');
                applyNightSchedule(NightShiftManager.currentSchedule);
            }
            
            // 最后尝试从DB读取
            if (Object.keys(nightShiftMap).length === 0 && typeof DB !== 'undefined' && typeof DB.loadNightShiftSchedule === 'function') {
                try {
                    const nightScheduleData = await DB.loadNightShiftSchedule('current');
                    if (nightScheduleData && nightScheduleData.schedule) {
                        console.log('[MonthlyScheduleConfigManager] 从DB读取大夜排班数据');
                        applyNightSchedule(nightScheduleData.schedule);
                    }
                } catch (error) {
                    console.warn('读取大夜排班失败:', error);
                }
            }
            
            console.log('[MonthlyScheduleConfigManager] 大夜排班数据已加载，员工数量:', Object.keys(nightShiftMap).length);

            // 【修复】优先从激活的个性化休假配置读取休假数据
            let personalRequestsData = Store.state.personalRequests || {};
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
            
            // 计算每个人的应上班天数（总天数 - 法定节假日 - 年假）
            const expectedWorkDaysMap = {};
            allStaffData.forEach(staff => {
                const staffId = staff.staffId || staff.id;
                // 从激活的个性化休假配置中读取年假数据
                const staffPersonalRequests = personalRequestsData[staffId] || {};
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
                const nightCount = nightShiftMap[staffId] 
                    ? Object.keys(nightShiftMap[staffId]).filter(dateStr => nightShiftMap[staffId][dateStr] === 'night').length 
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

            // 渲染HTML
            if (typeof MonthlyScheduleTableRenderer !== 'undefined' && MonthlyScheduleTableRenderer.renderHTML) {
                scheduleTable.innerHTML = MonthlyScheduleTableRenderer.renderHTML({
                    dateList,
                    displayStaffData,
                    allStaffData,
                    filterState,
                    currentConfigName: this.currentConfigName,
                    expectedWorkDaysMap,
                    shiftTypes: this.SHIFT_TYPES,
                    configId: config.configId,
                    staffScheduleData: config.staffScheduleData,
                    nightShiftMap,
                    personalRequests: personalRequestsData, // 【修复】使用从激活配置读取的个性化休假数据
                    restDaysMap,
                    specialFlags,
                    connectedToSpecial
                });
            } else {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-gray-400">
                        <p>月度班次渲染器未加载，请刷新页面重试</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('updateMonthlyScheduleDisplay 失败:', error);
            alert('渲染月度班次配置失败：' + error.message);
        } finally {
            _isUpdatingMonthlyScheduleDisplay = false;
        }
    },

    /**
     * 配置参数（暂时支持自定义技能列表）
     */
    openConfigParams() {
        const defaultValue = this.SKILL_TYPES.join(',');
        const promptFn = typeof showInputDialog === 'function'
            ? showInputDialog
            : (options) => Promise.resolve(window.prompt(options.title, options.defaultValue));

        promptFn({
            title: '设置技能列表（逗号分隔）',
            defaultValue: defaultValue,
            placeholder: '例如：星,综,收'
        }).then(result => {
            if (typeof result !== 'string') {
                return;
            }
            const list = result.split(',')
                .map(s => s.trim())
                .filter(s => s);
            if (list.length === 0) {
                alert('技能列表不能为空');
                return;
            }
            this.SKILL_TYPES = list;
            updateStatus('技能列表已更新', 'success');
        }).catch(error => {
            console.error('配置参数失败:', error);
        });
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
     * 生成月度班次配置（技能随机均衡填充）
     */
    async generateMonthlyScheduleConfig() {
        const config = this.getCurrentConfig();
        if (!config) {
            alert('未找到配置');
            return;
        }

        const scheduleConfig = Store.getState('scheduleConfig');
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            alert('请先配置排班周期');
            return;
        }

        if (!this.SKILL_TYPES || this.SKILL_TYPES.length === 0) {
            alert('技能列表为空，请先配置参数');
            return;
        }

        try {
            const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
            const staffIds = Object.keys(config.staffScheduleData || {});
            const personalRequests = Store.state.personalRequests || {};

            // 获取大夜排班与应上白班天数
            const nightShiftMap = await this.getNightShiftMap();
            const expectedDayShiftMap = this.calculateExpectedDayShiftMap(dateList, nightShiftMap);

            // 获取每日人力配置的技能要求（每天必须满足）
            const dailyDemand = await this.getDailySkillDemandFromDailyConfig();
            const roleSkillWeights = await this.getRoleSkillWeightsFromDailyConfig();

            // 约束：最长连续上班（含大夜）不超过6天；最多7天
            const maxConsecutiveWorkDays = 6;
            const maxRelaxedDays = 7;

            // 初始化所有人员数据结构
            const staffMeta = {};
            staffIds.forEach(staffId => {
                const staffData = config.staffScheduleData[staffId];
                if (!staffData.shiftType || !this.SHIFT_TYPES.includes(staffData.shiftType)) {
                    staffData.shiftType = this.getRandomShiftType();
                }
                if (!staffData.dailySchedule) {
                    staffData.dailySchedule = {};
                }
                const staffInfo = this.findStaffInfo(staffId);
                let normalizedLocation = '上海'; // 归属地统一为上海
                staffMeta[staffId] = {
                    shiftType: staffData.shiftType,
                    location: normalizedLocation,
                    remainingDays: expectedDayShiftMap[staffId] || 0,
                    totalExpectedDays: expectedDayShiftMap[staffId] || 0,
                    skillTargets: this.buildSkillTargets(staffData.shiftType, expectedDayShiftMap[staffId] || 0, roleSkillWeights),
                    assignedSkillCounts: {},
                    assignedDayCount: 0,
                    workTypes: new Array(dateList.length).fill(''),
                    blocked: new Array(dateList.length).fill(false),
                    workablePrefixCounts: [],
                    totalWorkableDays: 0
                };
                this.SKILL_TYPES.forEach(skill => {
                    staffMeta[staffId].assignedSkillCounts[skill] = 0;
                });
            });

            // 标记大夜与强制不可排白班 + 休假
            staffIds.forEach(staffId => {
                const meta = staffMeta[staffId];
                const nightDays = nightShiftMap[staffId] || {};
                const requests = personalRequests[staffId] || {};
                dateList.forEach((d, idx) => {
                    const dateStr = d.dateStr;
                    if (nightDays[dateStr]) {
                        meta.workTypes[idx] = 'N';
                    }
                    if (requests[dateStr]) {
                        meta.blocked[idx] = true;
                    }
                });
                dateList.forEach((d, idx) => {
                    if (meta.workTypes[idx] === 'N') {
                        if (idx + 1 < dateList.length) meta.blocked[idx + 1] = true;
                        if (idx + 2 < dateList.length) meta.blocked[idx + 2] = true;
                    }
                });
            });

            // 预计算可排白班天数分布，用于均衡分配避免前期过度消耗
            staffIds.forEach(staffId => {
                const meta = staffMeta[staffId];
                let workableCount = 0;
                meta.workablePrefixCounts = new Array(dateList.length).fill(0);
                dateList.forEach((_, idx) => {
                    const workable = meta.workTypes[idx] !== 'N' && !meta.blocked[idx];
                    if (workable) workableCount += 1;
                    meta.workablePrefixCounts[idx] = workableCount;
                });
                meta.totalWorkableDays = workableCount;
            });

            const warnings = [];
            const dailyCounts = {};

            // 逐日分配，确保每天技能数量满足配置
            dateList.forEach((dateInfo, dayIdx) => {
                const dateStr = dateInfo.dateStr;
                dailyCounts[dateStr] = {};

                // 1) 先满足每个班别-地点-技能的最小数量
                Object.keys(dailyDemand).forEach(role => {
                    Object.keys(dailyDemand[role]).forEach(loc => {
                        Object.keys(dailyDemand[role][loc]).forEach(skill => {
                            const demand = dailyDemand[role][loc][skill];
                            const minRequired = demand.min || 0;
                            const maxAllowed = demand.max == null ? Infinity : demand.max;
                            if (minRequired <= 0) {
                                return;
                            }

                            const currentCount = ((((dailyCounts[dateStr] || {})[role] || {})[loc] || {})[skill] || 0);
                            const group = this.getAvailableStaffForDay(staffMeta, role, loc, dayIdx, maxConsecutiveWorkDays, true);
                            const assigned = this.assignSkillForDay(group, staffMeta, config, dayIdx, dateStr, skill, minRequired, currentCount, maxAllowed, true);

                            if (assigned < minRequired) {
                                warnings.push(`${dateStr} ${role}-${loc}-${skill} 需求不足（${assigned}/${minRequired}）`);
                            }
                            this.increaseDailyCount(dailyCounts, dateStr, role, loc, skill, assigned);
                        });
                    });
                });

                // 2) 继续分配剩余人员，满足白班天数与技能均衡，同时不超过max
                staffIds.forEach(staffId => {
                    const meta = staffMeta[staffId];
                    if (meta.remainingDays <= 0) return;
                    if (meta.workTypes[dayIdx] === 'N') return;
                    if (meta.blocked[dayIdx]) return;
                    if (meta.workTypes[dayIdx] === 'D') return;
                    if (this.willExceedConsecutive(meta.workTypes, dayIdx, maxRelaxedDays)) return;

                    const role = meta.shiftType;
                    const loc = meta.location;
                    const workableSoFar = meta.workablePrefixCounts[dayIdx] || 0;
                    const workableBefore = dayIdx > 0 ? (meta.workablePrefixCounts[dayIdx - 1] || 0) : 0;
                    const remainingAssignable = Math.max(0, (meta.totalWorkableDays || 0) - workableBefore);
                    const mustAssign = remainingAssignable > 0 && meta.remainingDays >= remainingAssignable;
                    if (!mustAssign && (meta.totalWorkableDays || 0) > 0) {
                        const idealSoFar = Math.ceil((meta.totalExpectedDays || 0) * (workableSoFar / meta.totalWorkableDays));
                        if (meta.assignedDayCount >= idealSoFar) return;
                    }

                    const bestSkill = this.pickBestSkillForStaff(meta, roleSkillWeights, dailyDemand, dailyCounts, dateStr, role, loc);
                    if (!bestSkill) return;

                    // 分配
                    meta.workTypes[dayIdx] = 'D';
                    meta.remainingDays -= 1;
                    meta.assignedSkillCounts[bestSkill] += 1;
                    meta.assignedDayCount += 1;
                    config.staffScheduleData[staffId].dailySchedule[dateStr] = bestSkill;
                    this.increaseDailyCount(dailyCounts, dateStr, role, loc, bestSkill, 1);
                });
            });

            // 生成后校验白班天数
            staffIds.forEach(staffId => {
                const remaining = staffMeta[staffId].remainingDays;
                if (remaining > 0) {
                    warnings.push(`员工${staffId}白班天数不足（缺${remaining}天）`);
                } else if (remaining < 0) {
                    warnings.push(`员工${staffId}白班天数超出（多${Math.abs(remaining)}天）`);
                }
            });

            // 清理未分配日的技能（避免脏数据）
            staffIds.forEach(staffId => {
                const meta = staffMeta[staffId];
                Object.keys(config.staffScheduleData[staffId].dailySchedule).forEach(dateStr => {
                    const idx = dateList.findIndex(d => d.dateStr === dateStr);
                    if (idx === -1 || meta.workTypes[idx] !== 'D') {
                        delete config.staffScheduleData[staffId].dailySchedule[dateStr];
                    }
                });
            });

            config.updatedAt = new Date().toISOString();
            await DB.saveMonthlyScheduleConfig(config);
            await Store.saveState();
            this.updateMonthlyScheduleDisplay();
            updateStatus('已生成月度班次配置', 'success');

            if (warnings.length > 0) {
                console.warn('月度班次配置生成警告:', warnings);
                alert(`生成完成，但存在约束无法完全满足：\n${warnings.slice(0, 10).join('\n')}${warnings.length > 10 ? '\n...' : ''}`);
            }
        } catch (error) {
            console.error('生成月度班次配置失败:', error);
            alert('生成失败：' + error.message);
        }
    },

    /**
     * 获取每日技能需求（来自排班配置管理矩阵）
     * 格式: { role: { locationName: { skill: {min, max} } } }
     */
    async getDailySkillDemandFromDailyConfig() {
        const demand = {};
        this.SHIFT_TYPES.forEach(role => {
            demand[role] = { '上海': {} };
            this.SKILL_TYPES.forEach(skill => {
                demand[role]['上海'][skill] = { min: 0, max: null };
            });
        });

        const buildFromMatrix = (matrix) => {
            if (!matrix) return;
            // 仅处理上海地区
            const locations = [{ id: 'SH' }];
            this.SHIFT_TYPES.forEach(role => {
                this.SKILL_TYPES.forEach(skill => {
                    locations.forEach(loc => {
                        const key = `${role}_${loc.id}_${skill}`;
                        const cell = matrix[key];
                        if (cell) {
                            const minVal = typeof cell.min === 'number' ? cell.min : 0;
                            const maxVal = typeof cell.max === 'number' ? cell.max : null;
                            demand[role]['上海'][skill] = { min: minVal, max: maxVal };
                        }
                    });
                });
            });
        };

        if (typeof DailyManpowerManager !== 'undefined' && DailyManpowerManager.matrix) {
            buildFromMatrix(DailyManpowerManager.matrix);
            return demand;
        }
        const activeId = Store.state.activeDailyManpowerConfigId;
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
        return staffData.find(s => (s.staffId || s.id) === staffId) || {};
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
     * 【修复】包含大夜和休整期，区分类型
     */
    async getNightShiftMap() {
        const nightShiftMap = {};
        const applyNightSchedule = (schedule) => {
            if (!schedule) return;
            Object.keys(schedule).forEach(dateStr => {
                const assignments = schedule[dateStr] || [];
                assignments.forEach(assignment => {
                    if (!nightShiftMap[assignment.staffId]) {
                        nightShiftMap[assignment.staffId] = {};
                    }
                    // 【修复】不过滤休整期，区分大夜和休整
                    const shiftType = assignment.shiftType || 'night';
                    const isPostShiftRest = assignment.isPostShiftRest || false;
                    if (shiftType === 'rest' || isPostShiftRest) {
                        nightShiftMap[assignment.staffId][dateStr] = 'rest'; // 休整期
                    } else {
                        nightShiftMap[assignment.staffId][dateStr] = 'night'; // 大夜
                    }
                });
            });
        };

        if (typeof NightShiftManager !== 'undefined' && NightShiftManager.currentSchedule) {
            applyNightSchedule(NightShiftManager.currentSchedule);
        } else if (typeof DB !== 'undefined' && typeof DB.loadNightShiftSchedule === 'function') {
            try {
                const nightScheduleData = await DB.loadNightShiftSchedule('current');
                if (nightScheduleData && nightScheduleData.schedule) {
                    applyNightSchedule(nightScheduleData.schedule);
                }
            } catch (error) {
                console.warn('读取大夜排班失败:', error);
            }
        }
        return nightShiftMap;
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
            let annualLeaveCount = 0;
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                if (personalRequests[dateStr] === 'ANNUAL' && !Store.isRestDay(dateStr)) {
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
        const activeId = Store.state.activeDailyManpowerConfigId;
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

        const configs = Store.state.monthlyScheduleConfigs || [];
        const config = configs.find(c => c.configId === configId);

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

        config.updatedAt = new Date().toISOString();

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
            const configs = Store.state.monthlyScheduleConfigs || [];
            const config = configs.find(c => c.configId === configId);

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

        const configs = Store.state.monthlyScheduleConfigs || [];
        const config = configs.find(c => c.configId === this.currentConfigId);

        if (config) {
            config.name = newName;
            config.updatedAt = new Date().toISOString();

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
