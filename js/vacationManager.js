/**
 * 个性化休假管理模块
 * 负责个性化休假需求配置的查看、编辑和历史记录管理
 * 类似于 StaffManager，支持增删改查和激活
 * 
 * 注意：此文件导出 RequestManager 对象到全局作用域（window.RequestManager）
 * 没有独立的 RequestManager.js 文件，所有功能都在此文件中实现
 */

// 使用立即执行函数包裹，确保即使出错也能创建基本对象
(function() {
    'use strict';
    
    try {
        // 1. 最优先：确保全局对象存在（但不覆盖已有实现）
        if (typeof window !== 'undefined') {
            if (!window.RequestManager || Object.keys(window.RequestManager).length === 0) {
                window.RequestManager = {};
                console.log('js/vacationManager.js: 已初始化 window.RequestManager 空对象');
            } else {
                console.log('js/vacationManager.js: window.RequestManager 已存在，保留现有内容');
            }
        }
    } catch (e) {
        console.error('js/vacationManager.js: 初始化 window.RequestManager 失败', e);
        // 即使出错也尝试创建基本对象
        if (typeof window !== 'undefined') {
            try {
                window.RequestManager = window.RequestManager || {};
            } catch (e2) {
                console.error('js/vacationManager.js: 无法创建 window.RequestManager', e2);
            }
        }
    }
})();

// 立即执行的调试日志
(function() {
    console.log('vacationManager.js: 脚本文件开始执行');
    if (typeof window !== 'undefined') {
        console.log('vacationManager.js: window 对象存在');
    }
    if (typeof Store !== 'undefined') {
        console.log('vacationManager.js: Store 已存在');
    } else {
        console.warn('vacationManager.js: Store 尚未加载');
    }
})();

console.log('vacationManager.js: 开始加载脚本');

// 检查依赖项
if (typeof Store === 'undefined') {
    console.error('vacationManager.js: Store 未定义，请确保 state.js 已加载');
    console.warn('vacationManager.js: Store 未定义，但将继续定义 RequestManager');
    // 不抛出错误，继续定义 RequestManager
    // 在方法内部会检查 Store 是否存在
} else {
    console.log('vacationManager.js: Store 已加载');
}

// 定义 RequestManager 实现
var RequestManagerImpl = {
    currentView: 'configs', // 'configs' 或 'requestList'
    currentConfigId: null, // 当前查看的配置ID
    originalRequests: null, // 保存的原始需求数据，用于返回时恢复
    originalRestDays: null, // 保存的原始休息日数据，用于返回时恢复
    originalScheduleConfig: null, // 保存的原始排班配置，用于返回时恢复
    originalConfigName: null, // 保存的原始配置名称，用于判断是否需要创建新配置

    /**
     * 显示个性化休假管理页面（配置记录列表）
     */
    async showRequestManagement() {
        // 检查 Store 是否已加载
        if (typeof Store === 'undefined') {
            console.error('RequestManager.showRequestManagement: Store 未定义');
            alert('系统初始化未完成，请刷新页面重试');
            return;
        }
        
        this.currentView = 'configs';
        this.currentConfigId = null;
        
        // 保存视图状态到Store（但不覆盖激活状态）
        // 只更新视图相关状态，不更新激活状态
        Store.state.currentView = 'request';
        Store.state.currentSubView = 'configs';
        Store.state.currentConfigId = null;
        // 注意：不调用 saveState()，避免在页面加载时覆盖激活状态
        
        // 更新标题与导航高亮
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '个性化休假';
        }
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        if (btnScheduleView) {
            btnScheduleView.classList.remove('bg-blue-600');
            btnScheduleView.classList.add('bg-gray-400');
        }
        if (btnStaffManageView) {
            btnStaffManageView.classList.remove('bg-purple-600');
            btnStaffManageView.classList.add('bg-gray-400');
        }
        if (btnRequestManageView) {
            btnRequestManageView.classList.remove('bg-gray-400');
            btnRequestManageView.classList.add('bg-purple-600');
        }
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;
        
        // 检查是否有人员配置
        const staffConfigs = Store.getStaffConfigs();
        const activeStaffConfigId = Store.getState('activeConfigId');
        
        // 如果没有任何人员配置
        if (!staffConfigs || staffConfigs.length === 0) {
            scheduleTable.innerHTML = `
                <div class="p-8 text-center">
                    <div class="max-w-md mx-auto">
                        <div class="mb-6">
                            <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 class="text-lg font-medium text-gray-900 mb-2">请至少上传并激活一个人员配置</h3>
                        <p class="text-sm text-gray-500 mb-6">个性化休假功能需要先有人员配置数据。请先到"人员管理"页面上传人员配置。</p>
                        <button onclick="showStaffManageView()" 
                                class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            前往人员管理
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        // 如果没有激活的人员配置
        if (!activeStaffConfigId) {
            scheduleTable.innerHTML = `
                <div class="p-8 text-center">
                    <div class="max-w-md mx-auto">
                        <div class="mb-6">
                            <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 class="text-lg font-medium text-gray-900 mb-2">请至少激活一个人员配置</h3>
                        <p class="text-sm text-gray-500 mb-6">个性化休假功能需要先激活一个人员配置。请先到"人员管理"页面激活一个配置。</p>
                        <button onclick="showStaffManageView()" 
                                class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            前往人员管理
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        // 更新排班周期控件的禁用状态（在个性化休假配置页面层级可以修改）
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }
        
        // 直接显示配置列表（不自动创建配置）
        this.renderConfigList();
    },

    /**
     * 渲染配置记录列表
     */
    renderConfigList() {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        // 获取激活的排班周期配置
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        const activeSchedulePeriodConfig = activeSchedulePeriodConfigId 
            ? Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId)
            : null;
        
        // 获取当前排班周期的YYYYMM
        let currentYearMonth = null;
        if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig) {
            const year = activeSchedulePeriodConfig.scheduleConfig.year;
            const month = String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0');
            currentYearMonth = `${year}${month}`;
        }

        const configs = Store.getRequestConfigs();
        // 直接从 state 对象读取激活状态，确保获取最新值
        const activeConfigId = Store.state.activeRequestConfigId;
        
        console.log('renderConfigList: 激活配置ID:', activeConfigId);
        console.log('renderConfigList: 当前排班周期YYYYMM:', currentYearMonth);

        let html = `
            <div class="p-4">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">个性化休假配置管理</h2>
                    <div class="flex items-center space-x-2">
                        ${currentYearMonth ? `
                            <span class="text-sm text-gray-600">当前排班周期: ${currentYearMonth}</span>
                        ` : `
                            <span class="text-sm text-yellow-600">请先激活一个排班周期配置</span>
                        `}
                        <button onclick="if(typeof RequestManager !== 'undefined') { RequestManager.createNewConfig(); } else { alert('RequestManager未加载'); }" 
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            新建
                        </button>
                        <button onclick="if(typeof RequestManager !== 'undefined') { RequestManager.importConfig(); } else { alert('RequestManager未加载'); }" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            导入
                        </button>
                    </div>
                </div>
                <div class="bg-white rounded-lg shadow-sm overflow-hidden">
        `;

        // 过滤配置：如果当前有激活的排班周期，只显示对应月份的配置
        let filteredConfigs = configs;
        if (currentYearMonth) {
            filteredConfigs = configs.filter(config => {
                if (config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month) {
                    const configYearMonth = `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}`;
                    return configYearMonth === currentYearMonth;
                }
                return false;
            });
        }

        if (filteredConfigs.length === 0) {
            if (currentYearMonth) {
                html += `
                    <div class="p-8 text-center">
                        <div class="max-w-md mx-auto">
                            <div class="mb-4">
                                <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                            </div>
                            <h3 class="text-lg font-medium text-gray-900 mb-2">当前排班周期（${currentYearMonth}）暂无个性化需求配置</h3>
                            <p class="text-sm text-gray-500 mb-6">请点击"新建"创建该月份的个性化需求配置</p>
                            <button onclick="if(typeof RequestManager !== 'undefined') { RequestManager.createNewConfig(); } else { alert('RequestManager未加载'); }" 
                                    class="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                                新建配置
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="p-8 text-center text-gray-400">
                        <p>暂无配置记录</p>
                        <p class="mt-2 text-sm">请先激活一个排班周期配置，然后点击"新建"创建个性化需求配置</p>
                    </div>
                `;
            }
        } else {
            html += `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">YYYYMM</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配置名称</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">需求数量</th>
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
                const requestCount = this.getRequestCount(config.personalRequestsSnapshot);
                const schedulePeriod = config.schedulePeriod || '未设置';
                
                // 获取YYYYMM展示栏位
                let yearMonthDisplay = '-';
                if (config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month) {
                    yearMonthDisplay = `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}`;
                }

                html += `
                    <tr class="${isActive ? 'bg-blue-50' : rowClass}">
                        <td class="px-4 py-3 whitespace-nowrap">
                            <span class="text-sm font-bold text-gray-900">${yearMonthDisplay}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            <div class="flex items-center">
                                <span class="text-sm font-medium text-gray-900">${config.name}</span>
                            </div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${requestCount} 条</td>
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
                                    <button onclick="RequestManager.activateConfig('${config.configId}')" 
                                            class="text-blue-600 hover:text-blue-800 font-medium">
                                        激活
                                    </button>
                                ` : ''}
                                <button onclick="if(typeof RequestManager !== 'undefined') { RequestManager.viewConfig('${config.configId}'); } else { alert('RequestManager未加载'); }" 
                                        class="text-blue-600 hover:text-blue-800 font-medium">
                                    查看
                                </button>
                                <button onclick="RequestManager.editConfigName('${config.configId}')" 
                                        class="text-yellow-600 hover:text-yellow-800 font-medium">
                                    重命名
                                </button>
                                <button onclick="RequestManager.duplicateConfig('${config.configId}')" 
                                        class="text-green-600 hover:text-green-800 font-medium">
                                    复制
                                </button>
                                <button onclick="RequestManager.deleteConfig('${config.configId}')" 
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
    },

    /**
     * 创建新配置（自动选取当前激活的人员配置和排班周期）
     */
    async createNewConfig() {
        console.log('createNewConfig 被调用');
        try {
            // 获取当前激活的人员配置
            const activeConfigId = Store.getState('activeConfigId');
            if (!activeConfigId) {
                alert('请先激活一个人员配置');
                return;
            }

            const activeStaffConfig = Store.getStaffConfig(activeConfigId);
            if (!activeStaffConfig || !activeStaffConfig.staffDataSnapshot || activeStaffConfig.staffDataSnapshot.length === 0) {
                alert('当前激活的人员配置中没有人员数据');
                return;
            }

            // 获取当前排班周期（优先使用锁定的，否则使用计算的）
            let scheduleConfig = Store.getState('scheduleConfig');
            if (typeof ScheduleLockManager !== 'undefined') {
                const currentPeriod = ScheduleLockManager.getCurrentSchedulePeriod();
                scheduleConfig = {
                    startDate: currentPeriod.startDate,
                    endDate: currentPeriod.endDate,
                    year: currentPeriod.year,
                    month: currentPeriod.month
                };
            }
            
            if (!scheduleConfig.startDate || !scheduleConfig.endDate) {
                alert('请先配置排班周期');
                return;
            }

            // 获取当前激活的排班周期配置的年月
            const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
            if (!activeSchedulePeriodConfigId) {
                alert('请先激活一个排班周期配置');
                return;
            }
            
            const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            if (!activeSchedulePeriodConfig || !activeSchedulePeriodConfig.scheduleConfig) {
                alert('激活的排班周期配置无效');
                return;
            }
            
            const yearMonth = `${activeSchedulePeriodConfig.scheduleConfig.year}${String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`;
            
            // 检查是否已存在该月份的个性化需求配置
            const existingConfigs = Store.getRequestConfigs();
            const existing = existingConfigs.find(c => {
                if (c.scheduleConfig && c.scheduleConfig.year && c.scheduleConfig.month) {
                    const configYearMonth = `${c.scheduleConfig.year}${String(c.scheduleConfig.month).padStart(2, '0')}`;
                    return configYearMonth === yearMonth;
                }
                return false;
            });
            
            if (existing) {
                alert(`该月份（${yearMonth}）的个性化需求配置已存在：${existing.name}，请先删除或编辑现有配置`);
                return;
            }
            
            // 生成配置名称：不使用前缀，直接使用描述性名称
            const now = new Date();
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');
            // 格式：个性化休假配置-YYYYMM-HHmmss
            const defaultName = `个性化休假配置-${yearMonth}-${hour}${minute}${second}`;

            // 使用自定义输入对话框替代 prompt()
            const name = await showInputDialog('请输入配置名称：', defaultName);
            if (!name || name.trim() === '') {
                return;
            }

            // 创建空的个性化需求（默认是空的）
            const emptyRequests = {};
            
            // 从激活的排班周期配置中获取restDaysSnapshot
            let restDaysSnapshot = {};
            if (activeSchedulePeriodConfig.restDaysSnapshot) {
                restDaysSnapshot = JSON.parse(JSON.stringify(activeSchedulePeriodConfig.restDaysSnapshot));
            }
            
            // 创建配置
            const configId = Store.createRequestConfig(name, emptyRequests, restDaysSnapshot);
            
            // 保存排班周期信息（使用激活的排班周期配置的信息）
            const schedulePeriod = activeSchedulePeriodConfig.schedulePeriod || 
                `${activeSchedulePeriodConfig.scheduleConfig.startDate} 至 ${activeSchedulePeriodConfig.scheduleConfig.endDate}`;
            Store.updateRequestConfig(configId, { 
                schedulePeriod: schedulePeriod,
                scheduleConfig: {
                    startDate: activeSchedulePeriodConfig.scheduleConfig.startDate,
                    endDate: activeSchedulePeriodConfig.scheduleConfig.endDate,
                    year: activeSchedulePeriodConfig.scheduleConfig.year,
                    month: activeSchedulePeriodConfig.scheduleConfig.month
                }
            });
            
            // 激活该配置
            await Store.setActiveRequestConfig(configId);
            
            // 保存到IndexedDB
            await this.saveToIndexedDB();
            
            // 显示需求列表
            this.viewConfig(configId);
            
            updateStatus('配置已创建', 'success');
        } catch (error) {
            console.error('createNewConfig 失败:', error);
            alert('创建失败：' + error.message);
        }
    },

    /**
     * 导入配置（从Excel/CSV文件导入）
     */
    importConfig() {
        console.log('importConfig 被调用');
        try {
            // 创建隐藏的文件输入框
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.xlsx,.xls,.csv';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                document.body.removeChild(fileInput);
                return;
            }

            // 验证文件类型
            const validExtensions = ['.xlsx', '.xls', '.csv'];
            const fileName = file.name.toLowerCase();
            const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
            
            if (!isValidExtension) {
                alert('请上传 Excel 文件（.xlsx 或 .xls）或 CSV 文件（.csv）');
                document.body.removeChild(fileInput);
                return;
            }

            try {
                // 显示加载状态
                updateStatus('正在处理文件...', 'info');
                
                // 处理个人需求文件
                await DataLoader.processPersonalRequestsFile(file);
                
                // 获取当前激活的排班周期配置
                const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
                if (!activeSchedulePeriodConfigId) {
                    alert('请先激活一个排班周期配置');
                    document.body.removeChild(fileInput);
                    return;
                }
                
                const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
                if (!activeSchedulePeriodConfig || !activeSchedulePeriodConfig.scheduleConfig) {
                    alert('激活的排班周期配置无效');
                    document.body.removeChild(fileInput);
                    return;
                }
                
                const yearMonth = `${activeSchedulePeriodConfig.scheduleConfig.year}${String(activeSchedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`;
                
                // 检查是否已存在该月份的个性化需求配置
                const existingConfigs = Store.getRequestConfigs();
                const existing = existingConfigs.find(c => {
                    if (c.scheduleConfig && c.scheduleConfig.year && c.scheduleConfig.month) {
                        const configYearMonth = `${c.scheduleConfig.year}${String(c.scheduleConfig.month).padStart(2, '0')}`;
                        return configYearMonth === yearMonth;
                    }
                    return false;
                });
                
                if (existing) {
                    alert(`该月份（${yearMonth}）的个性化需求配置已存在：${existing.name}，请先删除或编辑现有配置`);
                    document.body.removeChild(fileInput);
                    return;
                }
                
                // 创建配置记录
                const now = new Date();
                const hour = String(now.getHours()).padStart(2, '0');
                const minute = String(now.getMinutes()).padStart(2, '0');
                const second = String(now.getSeconds()).padStart(2, '0');
                // 格式：个性化休假配置-YYYYMM-HHmmss
                const configName = `个性化休假配置-${yearMonth}-${hour}${minute}${second}`;
                
                const currentRequests = Store.getAllPersonalRequests();
                
                // 从激活的排班周期配置中获取restDaysSnapshot
                let restDaysSnapshot = {};
                if (activeSchedulePeriodConfig.restDaysSnapshot) {
                    restDaysSnapshot = JSON.parse(JSON.stringify(activeSchedulePeriodConfig.restDaysSnapshot));
                } else {
                    // 如果没有，使用当前的restDays
                    restDaysSnapshot = Store.getAllRestDays();
                }
                
                const configId = Store.createRequestConfig(configName, currentRequests, restDaysSnapshot);
                
                // 保存排班周期信息（使用激活的排班周期配置的信息）
                const schedulePeriod = activeSchedulePeriodConfig.schedulePeriod || 
                    `${activeSchedulePeriodConfig.scheduleConfig.startDate} 至 ${activeSchedulePeriodConfig.scheduleConfig.endDate}`;
                Store.updateRequestConfig(configId, { 
                    schedulePeriod: schedulePeriod,
                    scheduleConfig: {
                        startDate: activeSchedulePeriodConfig.scheduleConfig.startDate,
                        endDate: activeSchedulePeriodConfig.scheduleConfig.endDate,
                        year: activeSchedulePeriodConfig.scheduleConfig.year,
                        month: activeSchedulePeriodConfig.scheduleConfig.month
                    }
                });
                
                // 激活该配置
                await Store.setActiveRequestConfig(configId);
                
                // 保存到IndexedDB
                await this.saveToIndexedDB();
                
                // 更新界面
                this.renderConfigList();
                
                updateStatus('配置导入成功', 'success');
            } catch (error) {
                console.error('文件处理失败:', error);
                updateStatus('文件处理失败：' + error.message, 'error');
                alert('文件处理失败：' + error.message);
            } finally {
                document.body.removeChild(fileInput);
            }
            });
            
            // 触发文件选择
            document.body.appendChild(fileInput);
            fileInput.click();
        } catch (error) {
            console.error('importConfig 失败:', error);
            alert('导入失败：' + error.message);
        }
    },

    /**
     * 查看配置
     */
    async viewConfig(configId) {
        console.log('viewConfig 被调用，configId:', configId);
        console.log('RequestManager对象:', typeof RequestManager !== 'undefined' ? '存在' : '不存在');
        try {
            const config = Store.getRequestConfig(configId);
            if (!config) {
                alert('配置不存在');
                return;
            }
            
            console.log('准备显示需求列表，configId:', configId);
            // 激活该配置并显示需求列表
            await Store.setActiveRequestConfig(configId);
            this.currentConfigId = configId;
            this.currentView = 'requestList'; // 确保设置视图状态
            
            // 保存视图状态到Store
            Store.updateState({
                currentView: 'request',
                currentSubView: 'requestList',
                currentConfigId: configId
            });
            Store.saveState();
            
            console.log('设置currentView为requestList，准备调用viewRequestList');
            await this.viewRequestList(configId);
        } catch (error) {
            console.error('viewConfig 失败:', error);
            console.error('错误堆栈:', error.stack);
            alert('查看配置失败：' + error.message);
        }
    },

    /**
     * 自动保存当前个性化休假配置（已移除，仅在用户点击保存按钮时保存）
     * 此方法保留但不使用，避免误调用
     */
    async autoSaveCurrentConfig() {
        // 已禁用自动保存，仅在用户点击"配置校验并保存"按钮时保存
        console.warn('autoSaveCurrentConfig 已被禁用，请使用 validateAndSave 方法');
        return;
    },

    /**
     * 查看需求列表（显示交互式排班表，法定节假日在第一行）
     */
    viewRequestList(configId) {
        const scheduleTable = document.getElementById('scheduleTable');
        
        // 显示加载提示
        if (scheduleTable) {
            scheduleTable.innerHTML = `
                <div class="p-8 text-center">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p class="mt-4 text-gray-600">正在加载日历数据...</p>
                </div>
            `;
        }
        
        try {
            // 检查是否有人员配置（无论激活还是未激活）
            const staffConfigs = Store.getStaffConfigs();
            if (!staffConfigs || staffConfigs.length === 0) {
                // 如果没有人员配置，清空显示
                if (scheduleTable) {
                    scheduleTable.innerHTML = `
                        <div class="p-8 text-center">
                            <div class="max-w-md mx-auto">
                                <div class="mb-4">
                                    <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 class="text-lg font-medium text-gray-900 mb-2">请先上传人员配置</h3>
                                <p class="text-sm text-gray-500 mb-6">个性化休假功能需要先有人员配置数据。请先到"人员管理"页面上传人员配置。</p>
                                <button onclick="showStaffManageView()" 
                                        class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                                    前往人员管理
                                </button>
                            </div>
                        </div>
                    `;
                }
                updateStatus('请先上传人员配置', 'error');
                return;
            }
            
            this.currentView = 'requestList';
            const config = Store.getRequestConfig(configId);
            
            if (!config) {
                if (scheduleTable) {
                    scheduleTable.innerHTML = `
                        <div class="p-8 text-center text-red-600">
                            <p>配置不存在</p>
                        </div>
                    `;
                }
                updateStatus('配置不存在', 'error');
                return;
            }
            
            // 获取排班周期（优先使用配置中的，否则使用当前的）
            let scheduleConfig = config.scheduleConfig || Store.getState('scheduleConfig');
            
            if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
                scheduleConfig = Store.getState('scheduleConfig');
                if (!scheduleConfig.startDate || !scheduleConfig.endDate) {
                    if (scheduleTable) {
                        scheduleTable.innerHTML = `
                            <div class="p-8 text-center">
                                <div class="max-w-md mx-auto">
                                    <div class="mb-4">
                                        <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 class="text-lg font-medium text-gray-900 mb-2">请先配置排班周期</h3>
                                    <p class="text-sm text-gray-500 mb-6">请在左侧导航栏中配置排班周期的开始和结束日期。</p>
                                </div>
                            </div>
                        `;
                    }
                    updateStatus('请先配置排班周期', 'error');
                    return;
                }
            }
            
            // 保存原始数据，用于返回时恢复
            this.originalRequests = JSON.parse(JSON.stringify(Store.getAllPersonalRequests()));
            this.originalRestDays = JSON.parse(JSON.stringify(Store.getAllRestDays()));
            this.originalScheduleConfig = JSON.parse(JSON.stringify(Store.getState('scheduleConfig')));
            
            // 保存原始配置名称和排班周期（用于判断是否需要创建新配置）
            // 只在第一次查看配置时保存，避免覆盖
            if (!this.originalConfigName) {
                this.originalConfigName = config.name;
            }
            if (!this.originalScheduleConfig || (!this.originalScheduleConfig.year || !this.originalScheduleConfig.month)) {
                if (config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month) {
                    this.originalScheduleConfig = JSON.parse(JSON.stringify(config.scheduleConfig));
                } else {
                    // 如果配置中没有排班周期，使用当前的排班周期
                    const currentScheduleConfig = Store.getState('scheduleConfig');
                    if (currentScheduleConfig && currentScheduleConfig.year && currentScheduleConfig.month) {
                        this.originalScheduleConfig = {
                            year: currentScheduleConfig.year,
                            month: currentScheduleConfig.month
                        };
                    }
                }
            }
            
            // 保存原始的staffDataHistory，用于返回时恢复
            this.originalStaffDataHistory = JSON.parse(JSON.stringify(Store.getState('staffDataHistory')));
            
            // 获取激活的人员配置，并加载其人员数据快照
            const activeStaffConfigId = Store.getState('activeConfigId');
            console.log('viewRequestList: 激活的人员配置ID:', activeStaffConfigId);
            
            if (activeStaffConfigId) {
                const activeStaffConfig = Store.getStaffConfig(activeStaffConfigId);
                if (activeStaffConfig && activeStaffConfig.staffDataSnapshot) {
                    console.log('viewRequestList: 从激活配置加载人员数据，数量:', activeStaffConfig.staffDataSnapshot.length);
                    // 临时将人员配置快照加载到staffDataHistory中，供getCurrentStaffData使用
                    // 注意：这里需要将快照数据转换为staffDataHistory格式
                    const tempStaffHistory = {};
                    activeStaffConfig.staffDataSnapshot.forEach(staff => {
                        const staffId = staff.staffId || staff.id;
                        if (!tempStaffHistory[staffId]) {
                            tempStaffHistory[staffId] = [];
                        }
                        // 创建一个临时的历史记录
                        tempStaffHistory[staffId].push({
                            data: staff,
                            createdAt: new Date().toISOString(),
                            expiresAt: null,
                            isValid: true,
                            versionId: `temp_${staffId}_${Date.now()}`
                        });
                    });
                    // 临时替换staffDataHistory
                    Store.state.staffDataHistory = tempStaffHistory;
                    console.log('viewRequestList: 人员数据已临时加载到staffDataHistory');
                } else {
                    console.warn('viewRequestList: 激活的人员配置不存在或没有人员数据');
                }
            } else {
                console.warn('viewRequestList: 没有激活的人员配置');
            }
            
            // 临时加载该配置的需求数据
            Store.state.personalRequests = JSON.parse(JSON.stringify(config.personalRequestsSnapshot || {}));
            
            // 获取激活的排班周期配置的restDaysSnapshot，实现强绑定
            const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
            let restDays = {};
            
            if (activeSchedulePeriodConfigId) {
                const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
                if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.restDaysSnapshot) {
                    // 使用激活的排班周期配置的restDaysSnapshot
                    restDays = JSON.parse(JSON.stringify(activeSchedulePeriodConfig.restDaysSnapshot));
                    console.log('viewRequestList: 使用激活的排班周期配置的restDaysSnapshot，共', Object.keys(restDays).length, '天');
                } else {
                    // 如果激活的排班周期配置没有restDaysSnapshot，使用配置中保存的
                    restDays = JSON.parse(JSON.stringify(config.restDaysSnapshot || {}));
                    console.log('viewRequestList: 激活的排班周期配置没有restDaysSnapshot，使用配置中保存的');
                }
            } else {
                // 如果没有激活的排班周期配置，使用配置中保存的
                restDays = JSON.parse(JSON.stringify(config.restDaysSnapshot || {}));
                console.log('viewRequestList: 没有激活的排班周期配置，使用配置中保存的');
            }
            
            // 检查必要的函数是否可用
            if (typeof generateDateList === 'undefined' || typeof getHolidays === 'undefined') {
                console.error('viewRequestList: generateDateList 或 getHolidays 函数未定义');
                if (scheduleTable) {
                    scheduleTable.innerHTML = `
                        <div class="p-8 text-center text-red-600">
                            <p>系统函数未加载，请刷新页面重试</p>
                        </div>
                    `;
                }
                updateStatus('系统函数未加载，请刷新页面重试', 'error');
                return;
            }
            
            const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
            
            // 确保所有日期都有restDays设置（从激活的排班周期配置同步）
            for (const dateInfo of dateList) {
                const dateStr = dateInfo.dateStr;
                // 如果restDays中没有该日期，从激活的排班周期配置中获取
                if (restDays[dateStr] === undefined) {
                    if (activeSchedulePeriodConfigId) {
                        const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
                        if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.restDaysSnapshot) {
                            restDays[dateStr] = activeSchedulePeriodConfig.restDaysSnapshot[dateStr] !== undefined 
                                ? activeSchedulePeriodConfig.restDaysSnapshot[dateStr] 
                                : false;
                        } else {
                            // 如果没有，根据周末和节假日自动设置
                            restDays[dateStr] = dateInfo.isWeekend || dateInfo.isHoliday;
                        }
                    } else {
                        // 如果没有激活的排班周期配置，根据周末和节假日自动设置
                        restDays[dateStr] = dateInfo.isWeekend || dateInfo.isHoliday;
                    }
                }
            }
            
            Store.state.restDays = restDays;
            
            // 更新排班配置（临时）
            Store.updateState({
                scheduleConfig: scheduleConfig
            });
            
            // 设置当前配置ID和视图状态（必须在调用updateStaffDisplay之前设置）
            this.currentConfigId = configId;
            this.currentView = 'requestList'; // 确保设置视图状态
            
            console.log('viewRequestList: 准备调用updateStaffDisplay');
            console.log('viewRequestList: currentView:', this.currentView);
            console.log('viewRequestList: currentConfigId:', this.currentConfigId);
            console.log('viewRequestList: 排班周期:', scheduleConfig);
            console.log('viewRequestList: 人员配置数量:', Store.getStaffConfigs().length);
            
            // 验证人员数据是否已加载
            const staffData = Store.getCurrentStaffData();
            console.log('viewRequestList: 人员数据数量:', staffData ? staffData.length : 0);
            console.log('viewRequestList: 需求数据:', Object.keys(Store.getAllPersonalRequests()).length, '个人员');
            console.log('viewRequestList: 休息日数据:', Object.keys(Store.getAllRestDays()).length, '天');
            
            if (!staffData || staffData.length === 0) {
                console.error('viewRequestList: 人员数据为空，无法渲染日历');
                if (scheduleTable) {
                    scheduleTable.innerHTML = `
                        <div class="p-8 text-center text-gray-400">
                            <p>当前激活的人员配置中没有人员数据</p>
                            <p class="mt-2 text-sm">请先激活一个包含人员数据的配置</p>
                        </div>
                    `;
                }
                updateStatus('人员数据为空', 'error');
                return;
            }
            
            // 验证排班周期
            if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
                console.error('viewRequestList: 排班周期未配置');
                if (scheduleTable) {
                    scheduleTable.innerHTML = `
                        <div class="p-8 text-center text-gray-400">
                            <p>排班周期未配置</p>
                        </div>
                    `;
                }
                updateStatus('排班周期未配置', 'error');
                return;
            }
            
            // 更新排班周期控件的禁用状态（在个性化需求录入页面可以修改）
            if (typeof ScheduleLockManager !== 'undefined') {
                ScheduleLockManager.updateScheduleControlsState();
            }
            
            // 渲染需求列表（使用 app.js 中的 updateStaffDisplay，法定节假日会在第一行显示）
            console.log('viewRequestList: 调用updateStaffDisplay，当前scheduleTable内容:', scheduleTable.innerHTML.substring(0, 200));
            
            try {
                updateStaffDisplay();
                
                // 立即检查updateStaffDisplay是否成功执行
                setTimeout(() => {
                    const table = scheduleTable.querySelector('table');
                    if (!table) {
                        console.error('viewRequestList: updateStaffDisplay执行后，表格仍未创建');
                        console.error('viewRequestList: scheduleTable当前内容:', scheduleTable.innerHTML.substring(0, 500));
                        console.error('viewRequestList: 检查updateStaffDisplay是否提前返回');
                        
                        // 如果表格仍未创建，显示错误信息
                        scheduleTable.innerHTML = `
                            <div class="p-8 text-center text-red-600">
                                <p>日历渲染失败</p>
                                <p class="mt-2 text-sm text-gray-500">请查看控制台获取详细信息</p>
                                <p class="mt-2 text-xs text-gray-400">可能的原因：人员数据未加载、排班周期未配置或视图状态不正确</p>
                            </div>
                        `;
                        updateStatus('日历渲染失败，请查看控制台', 'error');
                    } else {
                        console.log('viewRequestList: updateStaffDisplay执行成功，表格已创建，行数:', table.querySelectorAll('tr').length);
                    }
                }, 200);
            } catch (error) {
                console.error('viewRequestList: updateStaffDisplay执行出错:', error);
                console.error('viewRequestList: 错误堆栈:', error.stack);
                if (scheduleTable) {
                    scheduleTable.innerHTML = `
                        <div class="p-8 text-center text-red-600">
                            <p>日历渲染出错：${error.message}</p>
                            <p class="mt-2 text-sm text-gray-500">请查看控制台获取详细信息</p>
                        </div>
                    `;
                }
                updateStatus('日历渲染出错：' + error.message, 'error');
            }
            
            // 验证日历是否成功渲染并添加按钮
            // 使用多次尝试，确保DOM完全渲染
            let retryCount = 0;
            const maxRetries = 10; // 增加重试次数
            const checkAndAddButtons = () => {
                const scheduleTable = document.getElementById('scheduleTable');
                if (!scheduleTable) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log(`viewRequestList: scheduleTable未找到，重试 ${retryCount}/${maxRetries}`);
                        setTimeout(checkAndAddButtons, 200);
                    } else {
                        console.error('viewRequestList: scheduleTable元素未找到');
                        updateStatus('页面元素未找到，请刷新页面重试', 'error');
                    }
                    return false;
                }
                
                const table = scheduleTable.querySelector('table');
                if (table) {
                    console.log('viewRequestList: 日历表格已成功渲染');
                    updateStatus('日历已加载', 'success');
                    
                    // 添加子页面按钮
                    this.addSubPageButtons();
                    return true;
                } else {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log(`viewRequestList: 日历表格未找到，重试 ${retryCount}/${maxRetries}`);
                        // 检查是否有错误提示
                        const errorMsg = scheduleTable.querySelector('.text-red-600, .text-gray-400');
                        if (errorMsg) {
                            console.warn('viewRequestList: 发现错误提示:', errorMsg.textContent);
                        }
                        setTimeout(checkAndAddButtons, 200);
                    } else {
                        console.error('viewRequestList: 日历表格未找到，可能渲染失败');
                        console.error('viewRequestList: scheduleTable内容:', scheduleTable.innerHTML.substring(0, 500));
                        updateStatus('日历渲染失败，请查看控制台日志', 'error');
                    }
                    return false;
                }
            };
            
            // 首次检查延迟800ms，给updateStaffDisplay足够时间渲染
            setTimeout(checkAndAddButtons, 800);
        } catch (error) {
            console.error('viewRequestList 执行失败:', error);
            if (scheduleTable) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-red-600">
                        <p>加载失败：${error.message}</p>
                        <p class="mt-2 text-sm text-gray-500">请查看控制台获取详细信息</p>
                    </div>
                `;
            }
            updateStatus('加载失败：' + error.message, 'error');
        }
    },

    /**
     * 激活配置
     */
    async activateConfig(configId) {
        try {
            // 先设置激活状态并等待保存完成
            await Store.setActiveRequestConfig(configId);
            // 然后保存所有数据到IndexedDB（包括配置记录）
            await this.saveToIndexedDB();
            // 最后渲染配置列表
            this.renderConfigList();
            updateStatus('配置已激活', 'success');
        } catch (error) {
            alert('激活失败：' + error.message);
        }
    },

    /**
     * 删除配置
     */
    async deleteConfig(configId) {
        const config = Store.getRequestConfig(configId);
        const isActive = config && config.configId === Store.getState('activeRequestConfigId');
        const configs = Store.getRequestConfigs();
        
        let confirmMessage = '确定要删除这个配置吗？此操作不可恢复。';
        if (isActive) {
            if (configs.length === 1) {
                confirmMessage = '这是最后一个配置，删除后将没有激活的配置。确定要删除吗？此操作不可恢复。';
            } else {
                confirmMessage = '这是当前激活的配置，删除后将自动取消激活。确定要删除吗？此操作不可恢复。';
            }
        }
        
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            Store.deleteRequestConfig(configId);
            if (typeof DB !== 'undefined' && DB.db) {
                await DB.deleteRequestConfig(configId);
            }
            await this.saveToIndexedDB();
            this.renderConfigList();
            updateStatus('配置已删除', 'success');
        } catch (error) {
            alert('删除失败：' + error.message);
        }
    },

    /**
     * 重命名配置
     */
    async editConfigName(configId) {
        const config = Store.getRequestConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }
        
        // 使用自定义输入对话框替代 prompt()
        const newName = await showInputDialog('请输入新名称：', config.name);
        if (!newName || newName.trim() === '') {
            return;
        }
        
        try {
            Store.updateRequestConfig(configId, { name: newName.trim() }, true); // 重命名时立即保存
            await this.saveToIndexedDB();
            this.renderConfigList();
            updateStatus('配置已重命名', 'success');
        } catch (error) {
            alert('重命名失败：' + error.message);
        }
    },

    /**
     * 复制配置
     */
    async duplicateConfig(configId) {
        try {
            const newConfigId = Store.duplicateRequestConfig(configId);
            await this.saveToIndexedDB();
            this.renderConfigList();
            updateStatus('配置已复制', 'success');
        } catch (error) {
            alert('复制失败：' + error.message);
        }
    },

    /**
     * 基于当前激活人员配置创建一个空的个性化休假配置
     */
    async createEmptyConfigFromActiveStaff() {
        const activeConfigId = Store.getState('activeConfigId');
        if (!activeConfigId) {
            alert('请先激活一个人员配置');
            this.renderConfigList();
            return;
        }
        const staffConfig = Store.getStaffConfig(activeConfigId);
        if (!staffConfig || !staffConfig.staffDataSnapshot || staffConfig.staffDataSnapshot.length === 0) {
            alert('当前激活的人员配置中没有人员数据');
            this.renderConfigList();
            return;
        }

        // 使用当前排班周期
        const scheduleConfig = Store.getState('scheduleConfig');
        const schedulePeriod = (scheduleConfig.startDate && scheduleConfig.endDate)
            ? `${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}`
            : '未设置';

        // 生成配置名称：YYYYMM_个性化休假_YYMMDD_HHMMSS
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        
        // 获取排班周期年月（如果有）- scheduleConfig 已在上面声明
        let scheduleYearMonth = '';
        if (scheduleConfig && scheduleConfig.endDate) {
            const scheduleEndDate = new Date(scheduleConfig.endDate);
            const scheduleYear = scheduleEndDate.getFullYear();
            const scheduleMonth = String(scheduleEndDate.getMonth() + 1).padStart(2, '0');
            scheduleYearMonth = `${scheduleYear}${scheduleMonth}`;
        } else {
            // 如果没有排班周期，使用当前年月
            scheduleYearMonth = `${year}${month}`;
        }
        
        // 格式：YYYYMM-个性化休假-YYYYMMDD-HHmmss（排班周期年月-个性化休假-创建时间）
        const defaultName = `${scheduleYearMonth}-个性化休假-${year}${month}${day}-${hour}${minute}${second}`;

        const emptyRequests = {};
        const restDays = Store.getAllRestDays();

        const configId = Store.createRequestConfig(defaultName, emptyRequests, restDays);
        Store.updateRequestConfig(configId, {
            schedulePeriod: schedulePeriod,
            scheduleConfig: scheduleConfig.startDate && scheduleConfig.endDate ? {
                startDate: scheduleConfig.startDate,
                endDate: scheduleConfig.endDate,
                year: scheduleConfig.year,
                month: scheduleConfig.month
            } : null
        });
        await Store.setActiveRequestConfig(configId);
        this.currentConfigId = configId;
        
        // 自动保存到浏览器
        await this.saveToIndexedDB();
        
        this.renderConfigList();
    },

    /**
     * 保存到IndexedDB（自动保存，优先保存到浏览器）
     */
    async saveToIndexedDB() {
        if (typeof DB !== 'undefined' && DB.db) {
            try {
                // 确保激活状态被包含在保存的状态中
                const currentState = Store.getState();
                console.log('saveToIndexedDB: 保存前的激活状态 - activeConfigId:', currentState.activeConfigId, 'activeRequestConfigId:', currentState.activeRequestConfigId);
                
                // 保存应用状态（包括激活状态）
                await DB.saveAppState(currentState);
                
                // 保存配置记录
                const configs = Store.getRequestConfigs();
                for (const config of configs) {
                    await DB.saveRequestConfig(config);
                }
                
                console.log('saveToIndexedDB: 保存完成 - activeConfigId:', currentState.activeConfigId, 'activeRequestConfigId:', currentState.activeRequestConfigId);
                console.log('数据已自动保存到浏览器');
            } catch (error) {
                console.error('自动保存到浏览器失败:', error);
                // 不抛出错误，允许继续操作
            }
        }
    },

    /**
     * 显示休息日规则配置对话框
     */
    async showRestDayRulesConfig() {
        const rules = await DB.loadRestDayRules();
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        let html = `
            <div class="p-4">
                <h2 class="text-xl font-bold text-gray-800 mb-4">休息日规则配置</h2>
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <form id="restDayRulesForm">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    休息日规则配置
                                </label>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">指定休息日不可超过（天）</label>
                                <input type="number" id="restDayRulesMaxRestDays" value="${rules.maxRestDays}" 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" min="1" step="1">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">周末指定休息日不可超过（天）</label>
                                <input type="number" id="restDayRulesMaxWeekendRestDays" value="${rules.maxWeekendRestDays}" 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" min="1" step="1">
                            </div>
                        </div>
                        <div class="mt-6 flex space-x-3">
                            <button type="submit" 
                                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                                保存
                            </button>
                            <button type="button" onclick="RequestManager.viewConfig('${this.currentConfigId || ''}')" 
                                    class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
                                取消
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        scheduleTable.innerHTML = html;

        // 绑定表单提交事件
        const form = document.getElementById('restDayRulesForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveRestDayRules();
            });
        }
    },

    /**
     * 保存休息日规则配置
     */
    async saveRestDayRules() {
        try {
            const maxRestDays = parseInt(document.getElementById('restDayRulesMaxRestDays').value) || 3;
            const maxWeekendRestDays = parseInt(document.getElementById('restDayRulesMaxWeekendRestDays').value) || 2;

            const rules = {
                maxRestDays: maxRestDays,
                maxWeekendRestDays: maxWeekendRestDays
            };

            // 保存到数据库
            if (typeof DB !== 'undefined' && DB.db) {
                await DB.saveRestDayRules(rules);
            }

            // 更新规则提示显示（使用span元素动态更新）
            const maxRestDaysSpan = document.getElementById('restDayRulesMaxRestDays');
            const maxWeekendRestDaysSpan = document.getElementById('restDayRulesMaxWeekendRestDays');
            if (maxRestDaysSpan) {
                maxRestDaysSpan.textContent = maxRestDays;
            }
            if (maxWeekendRestDaysSpan) {
                maxWeekendRestDaysSpan.textContent = maxWeekendRestDays;
            }

            // 如果当前在查看配置，刷新列表
            if (this.currentConfigId && this.currentView === 'requestList') {
                // 保持在子页面，重新加载配置数据
                const config = Store.getRequestConfig(this.currentConfigId);
                if (config) {
                    Store.state.personalRequests = JSON.parse(JSON.stringify(config.personalRequestsSnapshot || {}));
                    Store.state.restDays = JSON.parse(JSON.stringify(config.restDaysSnapshot || {}));
                    updateStaffDisplay();
                    // 重新添加按钮（增加延迟确保DOM完全渲染）
                    setTimeout(() => {
                        this.addSubPageButtons();
                    }, 300);
                }
            } else {
                this.renderConfigList();
            }

            updateStatus('休息日规则已更新', 'success');
        } catch (error) {
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 校验配置并保存
     */
    async validateAndSave() {
        if (!this.currentConfigId) {
            alert('请先选择一个配置');
            return;
        }

        const config = Store.getRequestConfig(this.currentConfigId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        // 获取当前的需求和休息日
        const currentRequests = Store.getAllPersonalRequests();
        const currentRestDays = Store.getAllRestDays();
        const scheduleConfig = config.scheduleConfig || Store.getState('scheduleConfig');
        
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            alert('请先配置排班周期');
            return;
        }

        // 加载规则配置
        let rules = null;
        if (typeof DB !== 'undefined' && DB.db) {
            try {
                rules = await DB.loadRestDayRules();
            } catch (error) {
                console.warn('加载休息日规则失败，使用默认规则:', error);
                rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
            }
        } else {
            rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
        }

        // 校验所有人员的休假需求
        const validationResults = await Validators.validateAllPersonalRequests(
            currentRequests, 
            scheduleConfig,
            rules
        );

        const errors = [];
        const errorStaffIds = [];
        
        for (const staffId in validationResults) {
            if (validationResults.hasOwnProperty(staffId)) {
                const result = validationResults[staffId];
                if (!result.isValid && result.errors.length > 0) {
                    errors.push({
                        staffId: staffId,
                        errors: result.errors
                    });
                    errorStaffIds.push(staffId);
                }
            }
        }

        // 如果有错误，显示错误并询问是否强制保存
        if (errors.length > 0) {
            const errorMessage = errors.map(e => {
                const staffData = Store.getCurrentStaffData();
                const staff = staffData.find(s => (s.staffId || s.id) === e.staffId);
                const staffName = staff ? staff.name : e.staffId;
                return `员工 ${staffName} (ID: ${e.staffId}):\n${e.errors.join('\n')}`;
            }).join('\n\n');

            const shouldSave = confirm(
                `发现 ${errors.length} 个错误：\n\n${errorMessage}\n\n是否强制保存？\n\n点击"确定"强制保存，点击"取消"取消保存。`
            );

            if (!shouldSave) {
                // 高亮错误行（在排班表中）
                this.highlightErrors(errorStaffIds);
                return;
            }
        }

        // 保存配置
        try {
            // 检查排班周期是否改变
            const currentScheduleConfig = Store.getState('scheduleConfig');
            const originalYear = this.originalScheduleConfig ? this.originalScheduleConfig.year : null;
            const originalMonth = this.originalScheduleConfig ? this.originalScheduleConfig.month : null;
            const currentYear = currentScheduleConfig ? currentScheduleConfig.year : null;
            const currentMonth = currentScheduleConfig ? currentScheduleConfig.month : null;
            
            const isScheduleChanged = originalYear !== currentYear || originalMonth !== currentMonth;
            const config = Store.getRequestConfig(this.currentConfigId);
            const currentConfigName = config ? config.name : null;
            
            let targetConfigId = this.currentConfigId;
            
            // 如果排班周期改变了，需要创建新配置
            if (isScheduleChanged && currentYear && currentMonth) {
                // 生成新配置名称：YYYYMM-原配置名称
                const yearMonthPrefix = `${currentYear}${String(currentMonth).padStart(2, '0')}`;
                const originalName = this.originalConfigName || currentConfigName || '未命名配置';
                
                // 如果原名称已经包含YYYYMM前缀，则替换；否则添加前缀
                const nameMatch = originalName.match(/^(\d{6})[-_](.+)$/);
                let newName;
                if (nameMatch) {
                    // 如果原名称有前缀，替换为新前缀（使用-连接）
                    newName = `${yearMonthPrefix}-${nameMatch[2]}`;
                } else {
                    // 如果原名称没有前缀，添加新前缀（使用-连接）
                    newName = `${yearMonthPrefix}-${originalName}`;
                }
                
                // 创建新配置
                const newConfigId = Store.createRequestConfig(newName, currentRequests, currentRestDays);
                
                // 保存排班周期信息
                const schedulePeriod = currentScheduleConfig.startDate && currentScheduleConfig.endDate
                    ? `${currentScheduleConfig.startDate} 至 ${currentScheduleConfig.endDate}`
                    : '未设置';
                
                Store.updateRequestConfig(newConfigId, {
                    schedulePeriod: schedulePeriod,
                    scheduleConfig: currentScheduleConfig.startDate && currentScheduleConfig.endDate ? {
                        startDate: currentScheduleConfig.startDate,
                        endDate: currentScheduleConfig.endDate,
                        year: currentScheduleConfig.year,
                        month: currentScheduleConfig.month
                    } : null
                }, false);
                
                // 不自动激活新配置，保持当前配置不变
                // await Store.setActiveRequestConfig(newConfigId); // 已移除自动激活
                targetConfigId = newConfigId;
                this.currentConfigId = newConfigId;
                
                console.log('排班周期已更改，已创建新配置:', { newConfigId, newName, originalYear, originalMonth, currentYear, currentMonth });
            } else {
                // 排班周期没有改变，更新现有配置
                // 如果配置名称被临时修改了，恢复原配置名称
                if (this.originalConfigName && config && config.name !== this.originalConfigName) {
                    Store.updateRequestConfig(this.currentConfigId, {
                        name: this.originalConfigName,
                        personalRequestsSnapshot: JSON.parse(JSON.stringify(currentRequests)),
                        restDaysSnapshot: JSON.parse(JSON.stringify(currentRestDays)),
                        updatedAt: new Date().toISOString()
                    }, false); // 不自动保存
                } else {
                    Store.updateRequestConfig(this.currentConfigId, {
                        personalRequestsSnapshot: JSON.parse(JSON.stringify(currentRequests)),
                        restDaysSnapshot: JSON.parse(JSON.stringify(currentRestDays)),
                        updatedAt: new Date().toISOString()
                    }, false); // 不自动保存
                }
            }

            // 保存到数据库（自动保存到浏览器）
            await this.saveToIndexedDB();
            
            // 清除错误高亮
            this.highlightErrors([]);

            // 保存成功后，无论是否有错误，都返回配置列表
            // 如果没有错误，显示成功提示后返回
            if (errors.length === 0) {
                // 校验通过，自动返回配置列表
                const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                updateStatusFn('配置校验通过并已保存', 'success');
                // 延迟一小段时间后返回，让用户看到成功提示
                setTimeout(() => {
                    this.backToConfigList();
                }, 300);
            } else {
                // 有错误但用户选择强制保存，也返回配置列表
                const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                updateStatusFn('配置已强制保存（存在错误）', 'error');
                // 延迟一小段时间后返回，让用户看到提示
                setTimeout(() => {
                    this.backToConfigList();
                }, 500);
            }
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 添加子页面按钮（返回、校验保存、规则配置）
     * @param {number} retryCount - 重试次数（内部使用）
     * @param {number} maxRetries - 最大重试次数
     */
    addSubPageButtons(retryCount = 0, maxRetries = 10) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            console.warn('scheduleTable 未找到，无法添加按钮');
            return;
        }
        
        // 查找header区域 - 尝试多种选择器方式
        let header = scheduleTable.querySelector('.p-4.border-b');
        if (!header) {
            // 尝试查找包含p-4和border-b类的元素（使用属性选择器）
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
            if (retryCount < maxRetries) {
                console.warn(`未找到header区域，等待DOM渲染完成... (${retryCount + 1}/${maxRetries})`);
                // 如果找不到header，可能是updateStaffDisplay还没完成渲染
                // 等待一段时间后重试
                setTimeout(() => {
                    this.addSubPageButtons(retryCount + 1, maxRetries);
                }, 300);
            } else {
                console.error('未找到header区域，已达到最大重试次数，停止重试');
            }
            return;
        }
        
        // 首先查找justify-between容器
        const justifyContainer = header.querySelector('.flex.items-center.justify-between');
        
        if (justifyContainer) {
            // 优先通过ID查找按钮容器
            let buttonContainer = header.querySelector('#requestActionButtons');
            
            if (!buttonContainer) {
                // 如果没有ID，查找现有的space-x-2按钮容器（找到最后一个，即最右边的）
                const containers = justifyContainer.querySelectorAll('.flex.items-center.space-x-2');
                buttonContainer = containers.length > 0 ? containers[containers.length - 1] : null;
            }
            
            if (!buttonContainer) {
                // 如果不存在，创建一个新的按钮容器
                buttonContainer = document.createElement('div');
                buttonContainer.className = 'flex items-center space-x-2';
                buttonContainer.id = 'requestActionButtons';
                justifyContainer.appendChild(buttonContainer);
            }
            
            // 清除可能存在的旧按钮（通过data属性识别）
            const existingButtons = buttonContainer.querySelectorAll('button[data-request-action]');
            existingButtons.forEach(btn => btn.remove());
            
            // 1. 添加休息日规则配置按钮
            const rulesButton = document.createElement('button');
            rulesButton.setAttribute('data-request-action', 'rules');
            rulesButton.textContent = '休息日规则配置';
            rulesButton.className = 'px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm font-medium';
            rulesButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showRestDayRulesConfig();
            };
            
            // 2. 添加批量上传需求按钮
            const uploadButton = document.createElement('button');
            uploadButton.setAttribute('data-request-action', 'upload');
            uploadButton.textContent = '批量上传需求';
            uploadButton.className = 'px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium';
            uploadButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof handleUploadPersonalRequests === 'function') {
                    handleUploadPersonalRequests();
                }
            };
            
            // 3. 添加导出需求按钮
            const exportButton = document.createElement('button');
            exportButton.setAttribute('data-request-action', 'export');
            exportButton.textContent = '导出需求';
            exportButton.className = 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium';
            exportButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof handleExportPersonalRequests === 'function') {
                    handleExportPersonalRequests();
                }
            };
            
            // 4. 添加配置校验并保存按钮
            const validateButton = document.createElement('button');
            validateButton.setAttribute('data-request-action', 'validate');
            validateButton.textContent = '配置校验并保存';
            validateButton.className = 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium';
            validateButton.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.validateAndSave();
            };
            
            // 5. 添加返回按钮
            const backButton = document.createElement('button');
            backButton.setAttribute('data-request-action', 'back');
            backButton.textContent = '返回配置列表';
            backButton.className = 'px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium';
            backButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.backToConfigList();
            };
            
            // 按顺序添加按钮
            buttonContainer.appendChild(rulesButton);
            buttonContainer.appendChild(uploadButton);
            buttonContainer.appendChild(exportButton);
            buttonContainer.appendChild(validateButton);
            buttonContainer.appendChild(backButton);
        } else {
            // 如果没有justify-between容器，需要创建整个结构
            console.warn('未找到justify-between容器，尝试创建新结构');
            const existingTitle = header.querySelector('h2');
            const existingDescription = header.querySelector('.text-xs.text-gray-500');
            
            // 创建新的flex容器结构
            const newContainer = document.createElement('div');
            newContainer.className = 'flex items-center justify-between mb-2';
            
            // 创建标题容器
            const titleDiv = document.createElement('div');
            if (existingTitle) {
                titleDiv.appendChild(existingTitle.cloneNode(true));
            } else {
                const titleH2 = document.createElement('h2');
                titleH2.className = 'text-lg font-bold text-gray-800';
                titleH2.textContent = '个性化需求录入';
                titleDiv.appendChild(titleH2);
            }
            newContainer.appendChild(titleDiv);
            
            // 创建按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'flex items-center space-x-2';
            
            // 1. 添加休息日规则配置按钮
            const rulesButton = document.createElement('button');
            rulesButton.setAttribute('data-request-action', 'rules');
            rulesButton.textContent = '休息日规则配置';
            rulesButton.className = 'px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm font-medium';
            rulesButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showRestDayRulesConfig();
            };
            
            // 2. 添加批量上传需求按钮
            const uploadButton = document.createElement('button');
            uploadButton.setAttribute('data-request-action', 'upload');
            uploadButton.textContent = '批量上传需求';
            uploadButton.className = 'px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium';
            uploadButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof handleUploadPersonalRequests === 'function') {
                    handleUploadPersonalRequests();
                }
            };
            
            // 3. 添加导出需求按钮
            const exportButton = document.createElement('button');
            exportButton.setAttribute('data-request-action', 'export');
            exportButton.textContent = '导出需求';
            exportButton.className = 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium';
            exportButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof handleExportPersonalRequests === 'function') {
                    handleExportPersonalRequests();
                }
            };
            
            // 4. 添加配置校验并保存按钮
            const validateButton = document.createElement('button');
            validateButton.setAttribute('data-request-action', 'validate');
            validateButton.textContent = '配置校验并保存';
            validateButton.className = 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium';
            validateButton.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.validateAndSave();
            };
            
            // 5. 添加返回按钮
            const backButton = document.createElement('button');
            backButton.setAttribute('data-request-action', 'back');
            backButton.textContent = '返回配置列表';
            backButton.className = 'px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium';
            backButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.backToConfigList();
            };
            
            // 按顺序添加按钮
            buttonContainer.appendChild(rulesButton);
            buttonContainer.appendChild(uploadButton);
            buttonContainer.appendChild(exportButton);
            buttonContainer.appendChild(validateButton);
            buttonContainer.appendChild(backButton);
            newContainer.appendChild(buttonContainer);
            
            // 替换header内容，保留描述部分
            const headerHTML = header.innerHTML;
            header.innerHTML = '';
            header.appendChild(newContainer);
            if (existingDescription) {
                header.appendChild(existingDescription.cloneNode(true));
            }
        }
    },

    /**
     * 返回配置列表
     */
    backToConfigList() {
        // 恢复原始需求数据和排班配置（取消当前所有更改）
        if (this.originalRequests !== null) {
            Store.state.personalRequests = JSON.parse(JSON.stringify(this.originalRequests));
        }
        if (this.originalRestDays !== null) {
            Store.state.restDays = JSON.parse(JSON.stringify(this.originalRestDays));
        }
        if (this.originalScheduleConfig !== null) {
            Store.updateState({
                scheduleConfig: JSON.parse(JSON.stringify(this.originalScheduleConfig))
            });
        }
        
        // 恢复原始配置名称（如果配置名称被临时修改了）
        if (this.originalConfigName && this.currentConfigId) {
            const config = Store.getRequestConfig(this.currentConfigId);
            if (config && config.name !== this.originalConfigName) {
                Store.updateRequestConfig(this.currentConfigId, {
                    name: this.originalConfigName
                }, false); // 不自动保存
            }
        }
        
        // 恢复原始的人员数据（如果有保存的原始数据）
        if (this.originalStaffDataHistory !== null) {
            Store.state.staffDataHistory = JSON.parse(JSON.stringify(this.originalStaffDataHistory));
        } else {
            // 如果没有保存的原始数据，从激活配置重新加载
            const activeStaffConfigId = Store.getState('activeConfigId');
            if (activeStaffConfigId) {
                const activeStaffConfig = Store.getStaffConfig(activeStaffConfigId);
                if (activeStaffConfig && activeStaffConfig.staffDataSnapshot) {
                    // 将人员配置快照重新加载到staffDataHistory
                    const tempStaffHistory = {};
                    activeStaffConfig.staffDataSnapshot.forEach(staff => {
                        const staffId = staff.staffId || staff.id;
                        if (!tempStaffHistory[staffId]) {
                            tempStaffHistory[staffId] = [];
                        }
                        tempStaffHistory[staffId].push({
                            data: staff,
                            createdAt: new Date().toISOString(),
                            expiresAt: null,
                            isValid: true,
                            versionId: `temp_${staffId}_${Date.now()}`
                        });
                    });
                    Store.state.staffDataHistory = tempStaffHistory;
                }
            }
        }
        
        // 保存状态（确保恢复的数据被保存）
        Store.saveState();
        
        // 清理保存的原始数据
        this.originalRequests = null;
        this.originalRestDays = null;
        this.originalScheduleConfig = null;
        this.originalConfigName = null;
        this.originalStaffDataHistory = null;
        
        // 重置视图状态
        this.currentView = 'configs';
        this.currentConfigId = null;
        
        // 保存视图状态到Store
        Store.updateState({
            currentView: 'request',
            currentSubView: 'configs',
            currentConfigId: null
        });
        Store.saveState();
        
        // 更新排班周期控件的禁用状态（在个性化休假配置页面层级可以修改）
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }
        
        // 渲染配置列表
        this.renderConfigList();
    },

    /**
     * 高亮错误行
     * @param {Array<string>} errorStaffIds - 错误人员ID数组
     */
    highlightErrors(errorStaffIds) {
        // 先清除所有错误高亮
        const allRows = document.querySelectorAll('tbody tr[data-staff-id]');
        allRows.forEach(row => {
            row.classList.remove('error-row');
            row.style.backgroundColor = '';
        });
        
        // 高亮错误行
        errorStaffIds.forEach(staffId => {
            const row = document.querySelector(`tr[data-staff-id="${staffId}"]`);
            if (row) {
                row.classList.add('error-row');
                row.style.backgroundColor = '#fee2e2';
            }
        });
    },

    /**
     * 统计需求条数（按日期汇总）
     */
    getRequestCount(requestsSnapshot) {
        if (!requestsSnapshot) return 0;
        let count = 0;
        Object.values(requestsSnapshot).forEach(map => {
            count += Object.keys(map || {}).length;
        });
        return count;
    }
};

// 立即暴露 RequestManager 到全局作用域（使用立即执行函数确保执行）
(function() {
    'use strict';
    
    try {
        // 首先检查 RequestManagerImpl 是否已定义
        if (typeof RequestManagerImpl === 'undefined') {
            console.error('js/vacationManager.js: 严重错误！RequestManagerImpl 未定义');
            console.error('js/vacationManager.js: 尝试检查变量作用域...');
            // 尝试直接访问
            try {
                if (typeof window !== 'undefined' && window.RequestManagerImpl) {
                    console.log('js/vacationManager.js: 在 window 对象中找到 RequestManagerImpl');
                    RequestManagerImpl = window.RequestManagerImpl;
                }
            } catch (e) {
                console.error('js/vacationManager.js: 无法访问 RequestManagerImpl', e);
            }
            return; // 如果 RequestManagerImpl 未定义，无法继续
        }
        
        console.log('vacationManager.js: RequestManagerImpl 对象定义完成，开始暴露到全局作用域');
        console.log('vacationManager.js: RequestManagerImpl 方法数量:', Object.keys(RequestManagerImpl).length);
        console.log('vacationManager.js: RequestManagerImpl 包含 showRequestManagement:', typeof RequestManagerImpl.showRequestManagement === 'function');
        
        if (typeof window !== 'undefined') {
            // 确保全局对象存在
            if (!window.RequestManager) {
                window.RequestManager = {};
                console.log('js/vacationManager.js: 创建新的 window.RequestManager 对象');
            }
            
            // 合并实现到全局对象
            Object.assign(window.RequestManager, RequestManagerImpl);
            console.log('js/vacationManager.js: RequestManager 已成功挂载到 window 对象');
            console.log('js/vacationManager.js: window.RequestManager 方法数量:', Object.keys(window.RequestManager).length);
            console.log('js/vacationManager.js: window.RequestManager.showRequestManagement 类型:', typeof window.RequestManager.showRequestManagement);
            
            // 验证挂载是否成功
            if (typeof window.RequestManager.showRequestManagement !== 'function') {
                console.error('js/vacationManager.js: 警告！showRequestManagement 方法未正确挂载');
                console.error('js/vacationManager.js: window.RequestManager 内容:', window.RequestManager);
                console.error('js/vacationManager.js: window.RequestManager 的键:', Object.keys(window.RequestManager));
            } else {
                console.log('js/vacationManager.js: ✓ RequestManager 挂载成功，showRequestManagement 方法可用');
            }
        } else {
            console.warn('js/vacationManager.js: window 对象不存在，无法挂载到全局');
        }
        
        // 兼容性定义
        var RequestManager = typeof window !== 'undefined' ? window.RequestManager : RequestManagerImpl;
        
        console.log('vacationManager.js: 脚本执行完成');
        console.log('vacationManager.js: 最终 RequestManager 状态:', {
            exists: typeof RequestManager !== 'undefined',
            hasShowRequestManagement: typeof RequestManager !== 'undefined' && typeof RequestManager.showRequestManagement === 'function',
            methodCount: typeof RequestManager !== 'undefined' ? Object.keys(RequestManager).length : 0,
            windowRequestManagerExists: typeof window !== 'undefined' && typeof window.RequestManager !== 'undefined',
            windowRequestManagerMethodCount: typeof window !== 'undefined' && window.RequestManager ? Object.keys(window.RequestManager).length : 0
        });
        
        // 最终验证：确保 window.RequestManager 存在且有方法
        if (typeof window !== 'undefined') {
            if (!window.RequestManager) {
                console.error('js/vacationManager.js: 严重错误！window.RequestManager 仍然不存在');
            } else if (typeof window.RequestManager.showRequestManagement !== 'function') {
                console.error('js/vacationManager.js: 严重错误！window.RequestManager.showRequestManagement 不是函数');
                console.error('js/vacationManager.js: window.RequestManager 的键:', Object.keys(window.RequestManager));
            } else {
                console.log('js/vacationManager.js: ✓ 最终验证通过，RequestManager 可用');
            }
        }
    } catch (e) {
        console.error('js/vacationManager.js: 挂载 RequestManager 时发生严重错误', e);
        console.error('js/vacationManager.js: 错误堆栈', e.stack);
        
        // 尝试最后的挽救：直接赋值
        if (typeof window !== 'undefined' && typeof RequestManagerImpl !== 'undefined') {
            try {
                window.RequestManager = RequestManagerImpl;
                console.log('js/vacationManager.js: 使用直接赋值方式恢复 RequestManager');
            } catch (e2) {
                console.error('js/vacationManager.js: 直接赋值也失败', e2);
            }
        }
    }
})();

// 最终保障：确保 window.RequestManager 存在（即使上面的代码出错）
if (typeof window !== 'undefined') {
    // 延迟检查，确保上面的代码有时间执行
    setTimeout(function() {
        if (typeof window.RequestManager === 'undefined' && typeof RequestManagerImpl !== 'undefined') {
            console.warn('js/vacationManager.js: 检测到 window.RequestManager 未定义，尝试恢复...');
            try {
                window.RequestManager = RequestManagerImpl;
                console.log('js/vacationManager.js: ✓ 已恢复 window.RequestManager');
            } catch (e) {
                console.error('js/vacationManager.js: 恢复失败', e);
            }
        } else if (typeof window.RequestManager !== 'undefined') {
            console.log('js/vacationManager.js: ✓ window.RequestManager 已存在');
            if (typeof window.RequestManager.showRequestManagement === 'function') {
                console.log('js/vacationManager.js: ✓ showRequestManagement 方法可用');
            } else {
                console.error('js/vacationManager.js: ✗ showRequestManagement 方法不可用');
            }
        }
    }, 100);
}
