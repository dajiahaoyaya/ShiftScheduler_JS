/**
 * 排班配置管理器
 * 负责排班配置的显示和管理
 */

const DailyManpowerManager = {
    currentView: 'configs', // 'configs' | 'baseFunctions' | 'businessFunctions' | 'complexRules'
    currentConfigId: null, // 当前查看的配置ID
    originalConfigSnapshot: null, // 保存的原始配置快照，用于返回时恢复
    editingCell: null, // 当前编辑的单元格
    matrix: {}, // 当前矩阵数据
    rules: [], // 当前规则列表
    customVars: [], // 自定义变量
    groups: [], // 规则组
    elementRefs: {}, // 元素引用，用于冲突可视化
    activeHoverConflict: null, // 当前悬停的冲突
    
    // 角色列表（包含大夜）
    ROLES: ['A1', 'A', 'A2', 'B1', 'B2', '大夜'],
    // 地点列表
    LOCATIONS: [
        { id: 'SH', name: '沪', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', chipBg: 'bg-blue-100', chipBorder: 'border-blue-300', chipText: 'text-blue-800' }, 
        { id: 'CD', name: '蓉', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', chipBg: 'bg-emerald-100', chipBorder: 'border-emerald-300', chipText: 'text-emerald-800' }
    ],
    // 技能列表
    SKILLS: [
        { id: '网', name: '网', category: 'base' },
        { id: '天', name: '天', category: 'base' },
        { id: '微', name: '微', category: 'base' },
        { id: '银B', name: '银B', category: 'base' },
        { id: '追', name: '追', category: 'base' },
        { id: '毛', name: '毛', category: 'base' },
        { id: '星', name: '星', category: 'biz' },
        { id: '综', name: '综', category: 'biz' },
        { id: '收', name: '收', category: 'biz' },
    ],
    
    // 基础职能列表（兼容旧代码）
    baseFunctionCodes: ['网', '天', '微', '银B', '追', '毛'],
    // 业务职能列表（兼容旧代码）
    businessFunctionCodes: ['星', '综', '收'],
    // 时段列表（兼容旧代码）
    timeSlots: ['A1', 'A', 'A2', 'B1', 'B2'],
    // 地区列表（兼容旧代码）
    locations: ['上海', '成都'],
    
    /**
     * 生成初始矩阵数据（角色×地点×技能）
     */
    generateInitialMatrix() {
        const data = {};
        this.ROLES.forEach(r => {
            this.LOCATIONS.forEach(l => {
                if (r === '大夜') {
                    data[`${r}_${l.id}_common`] = { min: 0, max: 0 };
                } else {
                    this.SKILLS.forEach(s => {
                        data[`${r}_${l.id}_${s.id}`] = { min: 0, max: 0 };
                    });
                }
            });
        });
        return data;
    },
    
    /**
     * 从旧格式配置转换为矩阵格式
     */
    convertToMatrix(baseFunctions, businessFunctions) {
        const matrix = this.generateInitialMatrix();
        
        // 转换基础职能
        if (baseFunctions) {
            this.timeSlots.forEach(slot => {
                this.baseFunctionCodes.forEach(func => {
                    const value = baseFunctions[slot]?.[func] || { min: 0, max: 0 };
                    this.LOCATIONS.forEach(loc => {
                        const key = `${slot}_${loc.id}_${func}`;
                        if (matrix[key]) {
                            matrix[key] = { ...value };
                        }
                    });
                });
            });
        }
        
        // 转换业务职能
        if (businessFunctions) {
            this.timeSlots.forEach(slot => {
                this.businessFunctionCodes.forEach(func => {
                    const value = businessFunctions[slot]?.[func] || { min: 0, max: 0 };
                    this.LOCATIONS.forEach(loc => {
                        const key = `${slot}_${loc.id}_${func}`;
                        if (matrix[key]) {
                            matrix[key] = { ...value };
                        }
                    });
                });
            });
        }
        
        return matrix;
    },
    
    /**
     * 从矩阵格式转换为旧格式配置
     */
    convertFromMatrix(matrix) {
        const baseFunctions = {};
        const businessFunctions = {};
        
        this.timeSlots.forEach(slot => {
            baseFunctions[slot] = {};
            businessFunctions[slot] = {};
            
            this.baseFunctionCodes.forEach(func => {
                const shKey = `${slot}_SH_${func}`;
                const cdKey = `${slot}_CD_${func}`;
                const shValue = matrix[shKey] || { min: 0, max: 0 };
                const cdValue = matrix[cdKey] || { min: 0, max: 0 };
                // 取两地点的最大值作为默认值
                baseFunctions[slot][func] = {
                    min: Math.max(shValue.min, cdValue.min),
                    max: Math.max(shValue.max, cdValue.max)
                };
            });
            
            this.businessFunctionCodes.forEach(func => {
                const shKey = `${slot}_SH_${func}`;
                const cdKey = `${slot}_CD_${func}`;
                const shValue = matrix[shKey] || { min: 0, max: 0 };
                const cdValue = matrix[cdKey] || { min: 0, max: 0 };
                businessFunctions[slot][func] = {
                    min: Math.max(shValue.min, cdValue.min),
                    max: Math.max(shValue.max, cdValue.max)
                };
            });
        });
        
        return { baseFunctions, businessFunctions };
    },
    
    // 默认基础职能配置（兼容旧代码）
    getDefaultBaseFunctions() {
        const defaultConfig = {};
        this.timeSlots.forEach(slot => {
            defaultConfig[slot] = {};
            this.baseFunctionCodes.forEach(func => {
                defaultConfig[slot][func] = {
                    min: 0,
                    max: 2
                };
                // 设置一些默认值
                if (func === '网') {
                    defaultConfig[slot][func].min = 2;
                    defaultConfig[slot][func].max = 2;
                } else if (func === '天' && (slot === 'A' || slot === 'A2' || slot === 'B2')) {
                    defaultConfig[slot][func].min = 1;
                    defaultConfig[slot][func].max = 1;
                } else if (func === '微' && slot !== 'A1') {
                    if (slot === 'A' || slot === 'A2') {
                        defaultConfig[slot][func].min = 1;
                        defaultConfig[slot][func].max = 1;
                    } else if (slot === 'B1' || slot === 'B2') {
                        defaultConfig[slot][func].min = 1;
                        defaultConfig[slot][func].max = 2;
                    }
                } else if (func === '银B' && (slot === 'A1' || slot === 'B1' || slot === 'B2')) {
                    defaultConfig[slot][func].min = 1;
                    defaultConfig[slot][func].max = 1;
                } else if (func === '追' && (slot === 'A' || slot === 'B2')) {
                    defaultConfig[slot][func].min = 1;
                    defaultConfig[slot][func].max = 1;
                } else if (func === '毛' && (slot === 'A1' || slot === 'B2')) {
                    defaultConfig[slot][func].min = 1;
                    defaultConfig[slot][func].max = 1;
                }
            });
        });
        return defaultConfig;
    },
    
    // 默认业务职能配置
    getDefaultBusinessFunctions() {
        const defaultConfig = {};
        this.timeSlots.forEach(slot => {
            defaultConfig[slot] = {};
            this.businessFunctionCodes.forEach(func => {
                defaultConfig[slot][func] = {
                    min: 0,
                    max: 1
                };
                // 设置一些默认值
                if (func === '星') {
                    defaultConfig[slot][func].min = slot === 'A1' || slot === 'A2' || slot === 'B1' ? 0 : 0;
                    defaultConfig[slot][func].max = 1;
                } else if (func === '综') {
                    defaultConfig[slot][func].min = slot === 'A' ? 0 : 0;
                    defaultConfig[slot][func].max = slot === 'A1' || slot === 'A2' || slot === 'B1' ? 0 : 1;
                } else if (func === '收') {
                    defaultConfig[slot][func].min = 0;
                    defaultConfig[slot][func].max = slot === 'A' || slot === 'B2' ? 1 : 0;
                }
            });
        });
        return defaultConfig;
    },
    
    // 默认复杂规则列表
    getDefaultComplexRules() {
        return [
            { id: '1', name: 'A_星+A_综', enabled: true, min: 0, max: 1, expression: 'A_星+A_综' },
            { id: '2', name: 'A_收+B2_综', enabled: true, min: 0, max: 1, expression: 'A_收+B2_综' },
            { id: '3', name: 'A_综+B2_收', enabled: true, min: 0, max: 1, expression: 'A_综+B2_收' },
            { id: '4', name: 'B2_星+B2_综', enabled: true, min: 0, max: 1, expression: 'B2_星+B2_综' },
            { id: '5', name: 'A1_星+A1_综+A1_收', enabled: true, min: 0, max: 1, expression: 'A1_星+A1_综+A1_收' },
            { id: '6', name: 'A_星+A_综+A_收', enabled: true, min: 0, max: 2, expression: 'A_星+A_综+A_收' },
            { id: '7', name: 'A2_星+A2_综+A2_收', enabled: true, min: 0, max: 1, expression: 'A2_星+A2_综+A2_收' },
            { id: '8', name: 'B1_星+B1_综+B1_收', enabled: true, min: 0, max: 1, expression: 'B1_星+B1_综+B1_收' },
            { id: '9', name: 'B2_星+B2_综+B2_收', enabled: true, min: 0, max: 3, expression: 'B2_星+B2_综+B2_收' },
            { id: '10', name: 'A2_星+A2_综+A2_收+B1_星+B1_综+B1_收', enabled: true, min: 1, max: 2, expression: 'A2_星+A2_综+A2_收+B1_星+B1_综+B1_收' },
            { id: '11', name: 'A_星+A_综+A_收+B2_星+B2_综+B2_收', enabled: true, min: 2, max: 6, expression: 'A_星+A_综+A_收+B2_星+B2_综+B2_收' },
            { id: '12', name: 'A1_星+A_星+A2_星+B1_星+B2_星', enabled: true, min: 2, max: 5, expression: 'A1_星+A_星+A2_星+B1_星+B2_星' },
            { id: '13', name: 'A1_综+A_综+A2_综+B1_综+B2_综', enabled: true, min: 1, max: 1, expression: 'A1_综+A_综+A2_综+B1_综+B2_综' },
            { id: '14', name: 'A1_收+A_收+A2_收+B1_收+B2_收', enabled: true, min: 1, max: 1, expression: 'A1_收+A_收+A2_收+B1_收+B2_收' },
            { id: '15', name: 'A1_上海', enabled: true, min: 2, max: null, expression: 'A1_上海', isLocationRule: true },
            { id: '16', name: 'A_上海', enabled: true, min: 2, max: null, expression: 'A_上海', isLocationRule: true },
            { id: '17', name: 'A2_上海', enabled: true, min: 1, max: null, expression: 'A2_上海', isLocationRule: true },
            { id: '18', name: 'B1_上海', enabled: true, min: 2, max: null, expression: 'B1_上海', isLocationRule: true },
            { id: '19', name: 'B2_上海', enabled: true, min: 3, max: null, expression: 'B2_上海', isLocationRule: true },
            { id: '20', name: '大夜_上海', enabled: true, min: 1, max: 2, expression: '大夜_上海', isLocationRule: true },
            { id: '21', name: 'A1_成都', enabled: true, min: null, max: null, expression: 'A1_成都', isLocationRule: true },
            { id: '22', name: 'A_成都', enabled: true, min: null, max: null, expression: 'A_成都', isLocationRule: true },
            { id: '23', name: 'A2_成都', enabled: true, min: null, max: null, expression: 'A2_成都', isLocationRule: true },
            { id: '24', name: 'B1_成都', enabled: true, min: null, max: null, expression: 'B1_成都', isLocationRule: true },
            { id: '25', name: 'B2_成都', enabled: true, min: null, max: null, expression: 'B2_成都', isLocationRule: true },
            { id: '26', name: '大夜_成都', enabled: true, min: 1, max: 2, expression: '大夜_成都', isLocationRule: true },
            { id: '27', name: '大夜_上海+大夜_成都', enabled: true, min: 3, max: 4, expression: '大夜_上海+大夜_成都', isLocationRule: true },
            { id: '28', name: 'A1_上海+A1_成都', enabled: true, min: null, max: null, expression: 'A1_上海+A1_成都', isLocationRule: true },
            { id: '29', name: 'A_上海+A_成都', enabled: true, min: null, max: null, expression: 'A_上海+A_成都', isLocationRule: true },
            { id: '30', name: 'A2_上海+A2_成都', enabled: true, min: null, max: null, expression: 'A2_上海+A2_成都', isLocationRule: true },
            { id: '31', name: 'B1_上海+B1_成都', enabled: true, min: null, max: null, expression: 'B1_上海+B1_成都', isLocationRule: true },
            { id: '32', name: 'B2_上海+B2_成都', enabled: true, min: null, max: null, expression: 'B2_上海+B2_成都', isLocationRule: true }
        ];
    },
    
    /**
     * 显示排版配置管理页面（配置记录列表）
     */
    async showDailyManpowerConfig() {
        try {
            console.log('DailyManpowerManager.showDailyManpowerConfig() 被调用');
            this.currentView = 'configs';
            this.currentConfigId = null;
            
            // 保存视图状态到Store（但不覆盖激活状态）
            if (typeof Store !== 'undefined') {
                // 只更新视图相关状态，不更新激活状态
                Store.state.currentView = 'dailyManpower';
                Store.state.currentSubView = 'configs';
                Store.state.currentConfigId = null;
                // 注意：不调用 saveState()，避免在页面加载时覆盖激活状态
            }
            
            // 检查Store是否存在
            if (typeof Store === 'undefined') {
                console.error('Store未定义');
                throw new Error('状态管理模块未加载');
            }
            
            // 检查scheduleTable元素是否存在
            const scheduleTable = document.getElementById('scheduleTable');
            if (!scheduleTable) {
                console.error('scheduleTable元素未找到');
                throw new Error('页面元素未找到');
            }
            
            console.log('开始渲染配置列表');
            await this.renderConfigList();
            console.log('配置列表渲染完成');
        } catch (error) {
            console.error('showDailyManpowerConfig执行失败:', error);
            const scheduleTable = document.getElementById('scheduleTable');
            if (scheduleTable) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-red-500">
                        <p class="text-lg font-bold">加载失败</p>
                        <p class="mt-2">${error.message}</p>
                        <p class="mt-4 text-sm text-gray-500">请查看控制台获取详细信息</p>
                    </div>
                `;
            }
            throw error;
        }
    },

    /**
     * 渲染配置记录列表
     */
    async renderConfigList() {
        try {
            console.log('renderConfigList开始执行');
            const scheduleTable = document.getElementById('scheduleTable');
            if (!scheduleTable) {
                console.error('scheduleTable元素未找到');
                return;
            }
            
            // 检查Store是否存在
            if (typeof Store === 'undefined') {
                console.error('Store未定义');
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-red-500">
                        <p>状态管理模块未加载</p>
                    </div>
                `;
                return;
            }

            // 加载所有配置
            const configs = await this.loadAllConfigs();
            // 获取激活的配置ID（从Store中获取，如果Store中有的话）
            const activeConfigId = Store.getState('activeDailyManpowerConfigId') || null;
            
            console.log('配置数量:', configs.length, '激活配置ID:', activeConfigId);
            
            // 如果没有任何配置，显示提示和新建按钮
            if (!configs || configs.length === 0) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center">
                        <div class="max-w-md mx-auto">
                            <div class="mb-6">
                                <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <h3 class="text-lg font-medium text-gray-900 mb-2">请创建排版配置</h3>
                            <p class="text-sm text-gray-500 mb-6">请先创建排版配置数据，然后才能进行后续操作。</p>
                            <div class="flex flex-col items-center space-y-3">
                                <button onclick="DailyManpowerManager.createNewConfig()" 
                                        class="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                                    新建配置
                                </button>
                                <button onclick="DailyManpowerManager.importConfig()" 
                                        class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                                    导入配置
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

        let html = `
            <div class="p-4">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">排班配置管理</h2>
                    <div class="flex items-center space-x-2">
                        <button onclick="DailyManpowerManager.createNewConfig()" 
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            新建
                        </button>
                        <button onclick="DailyManpowerManager.importConfig()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            导入
                        </button>
                    </div>
                </div>
                <div class="bg-white rounded-lg shadow-sm overflow-hidden">
        `;

        if (configs.length === 0) {
            html += `
                <div class="p-8 text-center text-gray-400">
                    <p>暂无配置记录</p>
                    <p class="mt-2 text-sm">点击"新建"或"导入"创建第一个配置</p>
                </div>
            `;
        } else {
            html += `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配置名称</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">规则数量</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最晚修改时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;

            // 按创建时间倒序排列
            const sortedConfigs = [...configs].sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            );

            sortedConfigs.forEach((config, index) => {
                const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                const isActive = config.configId === activeConfigId;
                
                // 计算规则数量
                const ruleCount = this.calculateRuleCount(config);

                // 去掉配置名称中的YYYYMM-前缀（如果有）
                const displayName = config.name.replace(/^\d{6}-/, '');
                
                html += `
                    <tr class="${rowClass} ${isActive ? 'ring-2 ring-blue-500' : ''}">
                        <td class="px-4 py-3 whitespace-nowrap">
                            <div class="flex items-center">
                                <span class="text-sm font-medium text-gray-900">${displayName}</span>
                                ${isActive ? '<span class="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">当前</span>' : ''}
                            </div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${ruleCount} 条</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.createdAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.updatedAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            ${isActive ? '<span class="text-green-600 font-medium">激活</span>' : '<span class="text-gray-400">未激活</span>'}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            <div class="flex items-center space-x-2">
                                ${!isActive ? `
                                    <button onclick="DailyManpowerManager.activateConfig('${config.configId}')" 
                                            class="text-blue-600 hover:text-blue-800 font-medium">
                                        激活
                                    </button>
                                ` : ''}
                                <button onclick="DailyManpowerManager.viewConfig('${config.configId}')" 
                                        class="text-blue-600 hover:text-blue-800 font-medium">
                                    查看
                                </button>
                                <button onclick="DailyManpowerManager.editConfigName('${config.configId}')" 
                                        class="text-yellow-600 hover:text-yellow-800 font-medium">
                                    重命名
                                </button>
                                <button onclick="DailyManpowerManager.duplicateConfig('${config.configId}')" 
                                        class="text-green-600 hover:text-green-800 font-medium">
                                    复制
                                </button>
                                <button onclick="DailyManpowerManager.deleteConfig('${config.configId}')" 
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

            console.log('准备设置innerHTML，HTML长度:', html.length);
            scheduleTable.innerHTML = html;
            console.log('renderConfigList执行完成');
        } catch (error) {
            console.error('renderConfigList执行失败:', error);
            const scheduleTable = document.getElementById('scheduleTable');
            if (scheduleTable) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-red-500">
                        <p class="text-lg font-bold">渲染失败</p>
                        <p class="mt-2">${error.message}</p>
                        <p class="mt-4 text-sm text-gray-500">错误详情：${error.stack || '无详细信息'}</p>
                        <p class="mt-4 text-sm text-gray-500">请查看控制台获取详细信息</p>
                    </div>
                `;
            }
            throw error;
        }
    },

    /**
     * 计算规则数量
     * @param {Object} config - 配置对象
     * @returns {number} 规则总数
     */
    calculateRuleCount(config) {
        let count = 0;
        
        // 基础职能规则数 = 时段数 * 基础职能数
        if (config.baseFunctions) {
            const baseFunctionCount = Object.keys(config.baseFunctions).length * this.baseFunctionCodes.length;
            count += baseFunctionCount;
        }
        
        // 业务职能规则数 = 时段数 * 业务职能数
        if (config.businessFunctions) {
            const businessFunctionCount = Object.keys(config.businessFunctions).length * this.businessFunctionCodes.length;
            count += businessFunctionCount;
        }
        
        // 复杂规则数
        if (config.complexRules && Array.isArray(config.complexRules)) {
            count += config.complexRules.length;
        }
        
        return count;
    },

    /**
     * 格式化日期时间
     * @param {string} dateString - ISO日期字符串
     * @returns {string} 格式化后的日期时间字符串
     */
    formatDateTime(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    },
    
    /**
     * 显示基础职能配置（矩阵表格版本）
     */
    async showBaseFunctionsConfig() {
        this.currentView = 'baseFunctions';
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }
        
        // 加载当前配置
        let config = await this.loadCurrentConfig();
        if (config) {
            // 如果配置存在，转换为矩阵格式
            if (config.baseFunctions || config.businessFunctions) {
                this.matrix = this.convertToMatrix(config.baseFunctions, config.businessFunctions);
            } else {
                this.matrix = this.generateInitialMatrix();
            }
        } else {
            this.matrix = this.generateInitialMatrix();
        }
        
        // 只显示基础职能的技能
        const baseSkills = this.SKILLS.filter(s => s.category === 'base');
        // 只显示非大夜的角色
        const roles = this.ROLES.filter(r => r !== '大夜');
        
        // 计算统计数据
        const stats = this.calculateStats();
        
        const html = `
            <div class="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col relative">
                <header class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
                    <div class="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="bg-indigo-600 text-white p-2 rounded-lg shadow-sm">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h1 class="text-lg font-bold text-slate-800 leading-tight">基础职能配置矩阵</h1>
                                <p class="text-xs text-slate-500">角色 × 地点 × 技能配置</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <button onclick="DailyManpowerManager.showDailyManpowerConfig()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all bg-white text-slate-600 border border-slate-200 hover:bg-slate-50">
                                返回配置列表
                            </button>
                            <button onclick="DailyManpowerManager.saveBaseFunctions()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm">
                                保存配置
                            </button>
                        </div>
                    </div>
                </header>

                <main class="flex-1 overflow-auto p-6 relative pb-20">
                    <div class="max-w-[1600px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                        <div class="overflow-x-auto max-h-[65vh]">
                            <table class="w-full border-collapse text-sm table-fixed relative">
                                <thead class="sticky top-0 z-30 shadow-md">
                                    <tr>
                                        <th class="w-32 sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-3 text-left font-bold text-slate-700 shadow-[1px_0_0_rgba(0,0,0,0.05)]">职能 \\ 班次</th>
                                        ${roles.map(role => `
                                            <th key="${role}" colSpan="2" class="border-b border-r border-slate-200 p-2 text-slate-800 font-bold text-center sticky top-0 bg-slate-100">${role}</th>
                                        `).join('')}
                                        <th class="bg-blue-50 border-b border-slate-200 p-2 w-24 font-bold text-blue-800 text-center sticky top-0 z-20">沪合计</th>
                                        <th class="bg-emerald-50 border-b border-slate-200 p-2 w-24 font-bold text-emerald-800 text-center sticky top-0 z-20">蓉合计</th>
                                        <th class="bg-purple-50 border-b border-slate-200 p-2 w-24 font-bold text-purple-800 text-center sticky top-0 z-20">总合计</th>
                                    </tr>
                                    <tr>
                                        <th class="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-2 text-xs text-slate-400 font-normal text-left shadow-[1px_0_0_rgba(0,0,0,0.05)]">编辑区域</th>
                                        ${roles.map(role => `
                                            ${this.LOCATIONS.map(loc => `
                                                <th key="${role}_${loc.id}" class="border-b border-r border-slate-100 p-1.5 text-xs font-bold text-center w-20 ${loc.bg} ${loc.color}">${loc.name}</th>
                                            `).join('')}
                                        `).join('')}
                                        <th class="bg-blue-50 border-b border-slate-200 p-1 text-[10px] text-blue-400 text-center">范围</th>
                                        <th class="bg-emerald-50 border-b border-slate-200 p-1 text-[10px] text-emerald-400 text-center">范围</th>
                                        <th class="bg-purple-50 border-b border-slate-200 p-1 text-[10px] text-purple-400 text-center">范围</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${baseSkills.map((skill, index) => `
                                        <tr key="${skill.id}" class="group">
                                            <td class="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 p-3 font-medium text-slate-700 flex items-center justify-between shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>${skill.name}
                                                </div>
                                            </td>
                                            ${roles.map(role => `
                                                ${this.LOCATIONS.map(loc => {
                                                    const key = `${role}_${loc.id}_${skill.id}`;
                                                    const cell = this.matrix[key] || {min:0, max:0};
                                                    return `
                                                        <td key="${key}" 
                                                            data-key="${key}"
                                                            onclick="DailyManpowerManager.handleCellClick('${key}', '${loc.name}_${role}_${skill.name}', event)" 
                                                            class="cursor-pointer border-b border-r border-slate-100 p-0 relative transition-colors hover:bg-slate-50"
                                                        >
                                                            <div class="h-10 w-full flex items-center justify-center text-xs font-mono">
                                                                <span class="${loc.color}">${cell.min}/${cell.max}</span>
                                                            </div>
                                                        </td>
                                                    `;
                                                }).join('')}
                                            `).join('')}
                                            ${[
                                                { id: 'SH', title: `沪_${skill.name}`, bg: 'bg-blue-50/30', data: stats.rowStats[skill.id]?.SH || {min:0, max:0} },
                                                { id: 'CD', title: `蓉_${skill.name}`, bg: 'bg-emerald-50/30', data: stats.rowStats[skill.id]?.CD || {min:0, max:0} },
                                                { id: 'ALL', title: `总_${skill.name}`, bg: 'bg-purple-50/30', data: stats.rowStats[skill.id]?.ALL || {min:0, max:0} },
                                            ].map(col => `
                                                <td key="${col.id}" 
                                                    class="border-b border-slate-200 p-2 text-center transition-colors ${col.bg} hover:bg-amber-100 cursor-pointer"
                                                >
                                                    <div class="flex flex-col items-center">
                                                        <span class="text-[10px] opacity-80 font-bold">${col.title}</span>
                                                        <span class="text-[10px] text-slate-500 font-mono scale-90">${col.data.min} - ${col.data.max}</span>
                                                    </div>
                                                </td>
                                            `).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot class="sticky bottom-0 z-30">
                                    <tr class="bg-slate-100 border-t-2 border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                                        <td class="sticky left-0 z-30 bg-slate-100 border-r border-slate-200 p-3 font-bold text-slate-800 text-right shadow-[1px_0_0_rgba(0,0,0,0.05)]">纵向合计</td>
                                        ${roles.map(role => `
                                            ${this.LOCATIONS.map(loc => {
                                                const s = stats.colStats[`${role}_${loc.id}`] || {min:0, max:0};
                                                return `
                                                    <td key="total_${role}_${loc.id}" 
                                                        class="p-2 border-r border-slate-200 text-center transition-colors cursor-pointer bg-purple-50 hover:bg-amber-100"
                                                    >
                                                        <div class="flex flex-col items-center">
                                                            <span class="text-[10px] font-bold text-slate-500 mb-0.5">${role}</span>
                                                            <span class="text-xs font-mono font-bold text-slate-700">${s.min}-${s.max}</span>
                                                        </div>
                                                    </td>
                                                `;
                                            }).join('')}
                                        `).join('')}
                                        ${[
                                            { id: 'SH', title: '沪总', bg: 'bg-blue-100 text-blue-900', data: stats.grandTotal.SH || {min:0, max:0} },
                                            { id: 'CD', title: '蓉总', bg: 'bg-emerald-100 text-emerald-900', data: stats.grandTotal.CD || {min:0, max:0} },
                                            { id: 'ALL', title: '全天', bg: 'bg-indigo-600 text-white', data: stats.grandTotal.ALL || {min:0, max:0} },
                                        ].map(col => `
                                            <td key="${col.id}" 
                                                class="p-2 text-center font-bold ${col.bg} transition-all shadow-inner cursor-pointer hover:ring-2 ring-amber-300"
                                            >
                                                <div class="flex flex-col items-center justify-center">
                                                    <div class="text-[10px] opacity-75 mb-0.5">${col.title}</div>
                                                    <div class="font-mono text-xs">${col.data.min}-${col.data.max}</div>
                                                </div>
                                            </td>
                                        `).join('')}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        `;
        
        scheduleTable.innerHTML = html;
        
        // 绑定元素引用
        this.bindElementRefs();
    },
    
    /**
     * 计算统计数据
     */
    calculateStats() {
        const rowStats = {};
        const colStats = {};
        const grandTotal = { ALL: {min:0, max:0}, SH: {min:0, max:0}, CD: {min:0, max:0} };
        
        const roles = this.ROLES.filter(r => r !== '大夜');
        
        // 初始化列统计
        roles.forEach(r => {
            this.LOCATIONS.forEach(l => {
                colStats[`${r}_${l.id}`] = { min: 0, max: 0 };
            });
        });
        
        // 计算行统计（按技能）
        this.SKILLS.forEach(s => {
            let rowMin = 0, rowMax = 0, rowShMin = 0, rowShMax = 0, rowCdMin = 0, rowCdMax = 0;
            roles.forEach(r => {
                this.LOCATIONS.forEach(l => {
                    const key = `${r}_${l.id}_${s.id}`;
                    const cell = this.matrix[key] || { min: 0, max: 0 };
                    if (l.id === 'SH') {
                        rowShMin += cell.min;
                        rowShMax += cell.max;
                    }
                    if (l.id === 'CD') {
                        rowCdMin += cell.min;
                        rowCdMax += cell.max;
                    }
                    rowMin += cell.min;
                    rowMax += cell.max;
                    colStats[`${r}_${l.id}`].min += cell.min;
                    colStats[`${r}_${l.id}`].max += cell.max;
                });
            });
            rowStats[s.id] = {
                ALL: {min: rowMin, max: rowMax},
                SH: {min: rowShMin, max: rowShMax},
                CD: {min: rowCdMin, max: rowCdMax}
            };
            grandTotal.ALL.min += rowMin;
            grandTotal.ALL.max += rowMax;
            grandTotal.SH.min += rowShMin;
            grandTotal.SH.max += rowShMax;
            grandTotal.CD.min += rowCdMin;
            grandTotal.CD.max += rowCdMax;
        });
        
        return { rowStats, colStats, grandTotal };
    },
    
    /**
     * 绑定元素引用（用于冲突可视化）
     */
    bindElementRefs() {
        const allCells = document.querySelectorAll('[data-key]');
        allCells.forEach(cell => {
            const key = cell.getAttribute('data-key');
            if (key) {
                this.elementRefs[key] = cell;
            }
        });
    },
    
    /**
     * 处理单元格点击
     */
    handleCellClick(key, displayName, event) {
        if (!key.startsWith('SYS_') && key.includes('_')) {
            const rect = event.currentTarget.getBoundingClientRect();
            let title = "编辑", subtitle = "";
            if (key.startsWith('大夜')) {
                const parts = key.split('_');
                const loc = this.LOCATIONS.find(l => l.id === parts[1]);
                title = `大夜 ${loc.name}`;
                subtitle = "通岗";
            } else {
                const [r, lId, sId] = key.split('_');
                const loc = this.LOCATIONS.find(l => l.id === lId);
                const skill = this.SKILLS.find(s => s.id === sId);
                if (loc && skill) {
                    title = `${r} ${loc.name}`;
                    subtitle = skill.name;
                }
            }
            this.editingCell = {
                id: key,
                title,
                subtitle,
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX - 40
            };
            this.renderCellEditor();
        }
    },
    
    /**
     * 渲染单元格编辑器
     */
    renderCellEditor() {
        if (!this.editingCell) return;
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;
        
        // 移除旧的编辑器
        const oldEditor = document.getElementById('cellEditor');
        if (oldEditor) oldEditor.remove();
        
        const cell = this.matrix[this.editingCell.id] || {min: 0, max: 0};
        
        const editor = document.createElement('div');
        editor.id = 'cellEditor';
        editor.className = 'fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-64 animate-in fade-in zoom-in-95 duration-100 ring-4 ring-black/5';
        editor.style.top = this.editingCell.top + 'px';
        editor.style.left = this.editingCell.left + 'px';
        
        editor.innerHTML = `
            <div class="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                <div>
                    <div class="font-bold text-slate-800 text-sm">${this.editingCell.title}</div>
                    <div class="text-xs text-slate-500">${this.editingCell.subtitle}</div>
                </div>
                <button onclick="DailyManpowerManager.closeCellEditor()" class="text-slate-400 hover:text-slate-700">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="flex gap-2">
                <div class="flex-1">
                    <label class="text-[10px] font-bold text-slate-400 mb-1 block">MIN</label>
                    <input type="number" 
                           min="0"
                           autofocus 
                           class="border border-slate-300 rounded w-full px-2 py-1.5 text-center font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none" 
                           value="${cell.min||''}" 
                           onchange="DailyManpowerManager.updateCellValue('min', this.value)">
                </div>
                <div class="flex-1">
                    <label class="text-[10px] font-bold text-slate-400 mb-1 block">MAX</label>
                    <input type="number" 
                           min="0"
                           class="border border-slate-300 rounded w-full px-2 py-1.5 text-center font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none" 
                           value="${cell.max||''}" 
                           onchange="DailyManpowerManager.updateCellValue('max', this.value)">
                </div>
            </div>
            <button onclick="DailyManpowerManager.closeCellEditor()" 
                    class="mt-3 w-full bg-slate-100 hover:bg-slate-200 rounded py-1.5 text-xs font-bold text-slate-600 transition-colors">
                完成
            </button>
        `;
        
        document.body.appendChild(editor);
    },
    
    /**
     * 更新单元格值
     */
    updateCellValue(type, value) {
        if (!this.editingCell) return;
        
        const val = Math.max(0, parseInt(value) || 0);
        const currentCell = this.matrix[this.editingCell.id] || {min: 0, max: 0};
        
        if (type === 'min') {
            const newMax = val > currentCell.max ? val : currentCell.max;
            this.matrix[this.editingCell.id] = { min: val, max: newMax };
        } else {
            const newMin = val < currentCell.min ? val : currentCell.min;
            this.matrix[this.editingCell.id] = { min: newMin, max: val };
        }
        
        // 更新显示
        this.refreshMatrixDisplay();
    },
    
    /**
     * 刷新矩阵显示
     */
    refreshMatrixDisplay() {
        const stats = this.calculateStats();
        const roles = this.ROLES.filter(r => r !== '大夜');
        const baseSkills = this.SKILLS.filter(s => s.category === 'base');
        
        // 更新所有单元格显示
        baseSkills.forEach(skill => {
            roles.forEach(role => {
                this.LOCATIONS.forEach(loc => {
                    const key = `${role}_${loc.id}_${skill.id}`;
                    const cell = this.matrix[key] || {min:0, max:0};
                    const cellEl = document.querySelector(`[data-key="${key}"]`);
                    if (cellEl) {
                        const span = cellEl.querySelector('span');
                        if (span) {
                            span.textContent = `${cell.min}/${cell.max}`;
                        }
                    }
                });
            });
        });
        
        // 更新统计行
        baseSkills.forEach(skill => {
            const rowStats = stats.rowStats[skill.id];
            if (rowStats) {
                ['SH', 'CD', 'ALL'].forEach((locId, idx) => {
                    const statEl = document.querySelector(`[data-stat="${skill.id}_${locId}"]`);
                    if (statEl) {
                        const rangeEl = statEl.querySelector('.text-\\[10px\\]');
                        if (rangeEl) {
                            const data = locId === 'SH' ? rowStats.SH : locId === 'CD' ? rowStats.CD : rowStats.ALL;
                            rangeEl.textContent = `${data.min} - ${data.max}`;
                        }
                    }
                });
            }
        });
    },
    
    /**
     * 关闭单元格编辑器
     */
    closeCellEditor() {
        this.editingCell = null;
        const editor = document.getElementById('cellEditor');
        if (editor) editor.remove();
    },
    
    /**
     * 显示业务职能配置（矩阵表格版本）
     */
    async showBusinessFunctionsConfig() {
        this.currentView = 'businessFunctions';
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }
        
        // 加载当前配置
        let config = await this.loadCurrentConfig();
        if (config) {
            // 如果配置存在，转换为矩阵格式
            if (config.baseFunctions || config.businessFunctions) {
                this.matrix = this.convertToMatrix(config.baseFunctions, config.businessFunctions);
            } else {
                this.matrix = this.generateInitialMatrix();
            }
        } else {
            this.matrix = this.generateInitialMatrix();
        }
        
        // 只显示业务职能的技能
        const bizSkills = this.SKILLS.filter(s => s.category === 'biz');
        // 只显示非大夜的角色
        const roles = this.ROLES.filter(r => r !== '大夜');
        
        // 计算统计数据
        const stats = this.calculateStats();
        
        const html = `
            <div class="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col relative">
                <header class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
                    <div class="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="bg-green-600 text-white p-2 rounded-lg shadow-sm">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h1 class="text-lg font-bold text-slate-800 leading-tight">业务职能配置矩阵</h1>
                                <p class="text-xs text-slate-500">角色 × 地点 × 技能配置</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <button onclick="DailyManpowerManager.showDailyManpowerConfig()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all bg-white text-slate-600 border border-slate-200 hover:bg-slate-50">
                                返回配置列表
                            </button>
                            <button onclick="DailyManpowerManager.saveBusinessFunctions()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all bg-green-600 text-white hover:bg-green-700 shadow-sm">
                                保存配置
                            </button>
                        </div>
                    </div>
                </header>

                <main class="flex-1 overflow-auto p-6 relative pb-20">
                    <div class="max-w-[1600px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                        <div class="overflow-x-auto max-h-[65vh]">
                            <table class="w-full border-collapse text-sm table-fixed relative">
                                <thead class="sticky top-0 z-30 shadow-md">
                                    <tr>
                                        <th class="w-32 sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-3 text-left font-bold text-slate-700 shadow-[1px_0_0_rgba(0,0,0,0.05)]">职能 \\ 班次</th>
                                        ${roles.map(role => `
                                            <th key="${role}" colSpan="2" class="border-b border-r border-slate-200 p-2 text-slate-800 font-bold text-center sticky top-0 bg-slate-100">${role}</th>
                                        `).join('')}
                                        <th class="bg-blue-50 border-b border-slate-200 p-2 w-24 font-bold text-blue-800 text-center sticky top-0 z-20">沪合计</th>
                                        <th class="bg-emerald-50 border-b border-slate-200 p-2 w-24 font-bold text-emerald-800 text-center sticky top-0 z-20">蓉合计</th>
                                        <th class="bg-purple-50 border-b border-slate-200 p-2 w-24 font-bold text-purple-800 text-center sticky top-0 z-20">总合计</th>
                                    </tr>
                                    <tr>
                                        <th class="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-2 text-xs text-slate-400 font-normal text-left shadow-[1px_0_0_rgba(0,0,0,0.05)]">编辑区域</th>
                                        ${roles.map(role => `
                                            ${this.LOCATIONS.map(loc => `
                                                <th key="${role}_${loc.id}" class="border-b border-r border-slate-100 p-1.5 text-xs font-bold text-center w-20 ${loc.bg} ${loc.color}">${loc.name}</th>
                                            `).join('')}
                                        `).join('')}
                                        <th class="bg-blue-50 border-b border-slate-200 p-1 text-[10px] text-blue-400 text-center">范围</th>
                                        <th class="bg-emerald-50 border-b border-slate-200 p-1 text-[10px] text-emerald-400 text-center">范围</th>
                                        <th class="bg-purple-50 border-b border-slate-200 p-1 text-[10px] text-purple-400 text-center">范围</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${bizSkills.map((skill, index) => `
                                        <tr key="${skill.id}" class="group">
                                            <td class="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 p-3 font-medium text-slate-700 flex items-center justify-between shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>${skill.name}
                                                </div>
                                            </td>
                                            ${roles.map(role => `
                                                ${this.LOCATIONS.map(loc => {
                                                    const key = `${role}_${loc.id}_${skill.id}`;
                                                    const cell = this.matrix[key] || {min:0, max:0};
                                                    return `
                                                        <td key="${key}" 
                                                            data-key="${key}"
                                                            onclick="DailyManpowerManager.handleCellClick('${key}', '${loc.name}_${role}_${skill.name}', event)" 
                                                            class="cursor-pointer border-b border-r border-slate-100 p-0 relative transition-colors hover:bg-slate-50"
                                                        >
                                                            <div class="h-10 w-full flex items-center justify-center text-xs font-mono">
                                                                <span class="${loc.color}">${cell.min}/${cell.max}</span>
                                                            </div>
                                                        </td>
                                                    `;
                                                }).join('')}
                                            `).join('')}
                                            ${[
                                                { id: 'SH', title: `沪_${skill.name}`, bg: 'bg-blue-50/30', data: stats.rowStats[skill.id]?.SH || {min:0, max:0} },
                                                { id: 'CD', title: `蓉_${skill.name}`, bg: 'bg-emerald-50/30', data: stats.rowStats[skill.id]?.CD || {min:0, max:0} },
                                                { id: 'ALL', title: `总_${skill.name}`, bg: 'bg-purple-50/30', data: stats.rowStats[skill.id]?.ALL || {min:0, max:0} },
                                            ].map(col => `
                                                <td key="${col.id}" 
                                                    class="border-b border-slate-200 p-2 text-center transition-colors ${col.bg} hover:bg-amber-100 cursor-pointer"
                                                >
                                                    <div class="flex flex-col items-center">
                                                        <span class="text-[10px] opacity-80 font-bold">${col.title}</span>
                                                        <span class="text-[10px] text-slate-500 font-mono scale-90">${col.data.min} - ${col.data.max}</span>
                                                    </div>
                                                </td>
                                            `).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot class="sticky bottom-0 z-30">
                                    <tr class="bg-slate-100 border-t-2 border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                                        <td class="sticky left-0 z-30 bg-slate-100 border-r border-slate-200 p-3 font-bold text-slate-800 text-right shadow-[1px_0_0_rgba(0,0,0,0.05)]">纵向合计</td>
                                        ${roles.map(role => `
                                            ${this.LOCATIONS.map(loc => {
                                                const s = stats.colStats[`${role}_${loc.id}`] || {min:0, max:0};
                                                return `
                                                    <td key="total_${role}_${loc.id}" 
                                                        class="p-2 border-r border-slate-200 text-center transition-colors cursor-pointer bg-purple-50 hover:bg-amber-100"
                                                    >
                                                        <div class="flex flex-col items-center">
                                                            <span class="text-[10px] font-bold text-slate-500 mb-0.5">${role}</span>
                                                            <span class="text-xs font-mono font-bold text-slate-700">${s.min}-${s.max}</span>
                                                        </div>
                                                    </td>
                                                `;
                                            }).join('')}
                                        `).join('')}
                                        ${[
                                            { id: 'SH', title: '沪总', bg: 'bg-blue-100 text-blue-900', data: stats.grandTotal.SH || {min:0, max:0} },
                                            { id: 'CD', title: '蓉总', bg: 'bg-emerald-100 text-emerald-900', data: stats.grandTotal.CD || {min:0, max:0} },
                                            { id: 'ALL', title: '全天', bg: 'bg-indigo-600 text-white', data: stats.grandTotal.ALL || {min:0, max:0} },
                                        ].map(col => `
                                            <td key="${col.id}" 
                                                class="p-2 text-center font-bold ${col.bg} transition-all shadow-inner cursor-pointer hover:ring-2 ring-amber-300"
                                            >
                                                <div class="flex flex-col items-center justify-center">
                                                    <div class="text-[10px] opacity-75 mb-0.5">${col.title}</div>
                                                    <div class="font-mono text-xs">${col.data.min}-${col.data.max}</div>
                                                </div>
                                            </td>
                                        `).join('')}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        `;
        
        scheduleTable.innerHTML = html;
        
        // 绑定元素引用
        this.bindElementRefs();
    },
    
    /**
     * 显示复杂规则配置（美化版本）
     */
    async showComplexRulesConfig() {
        this.currentView = 'complexRules';
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }
        
        // 加载当前配置
        let config = await this.loadCurrentConfig();
        const complexRules = config?.complexRules || this.getDefaultComplexRules();
        
        // 按类型分组规则
        const comboRules = complexRules.filter(r => !r.isLocationRule);
        const locationRules = complexRules.filter(r => r.isLocationRule);
        
        const html = `
            <div class="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col relative">
                <header class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
                    <div class="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="bg-purple-600 text-white p-2 rounded-lg shadow-sm">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h1 class="text-lg font-bold text-slate-800 leading-tight">复杂规则配置</h1>
                                <p class="text-xs text-slate-500">组合规则与地点规则管理</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <button onclick="DailyManpowerManager.showDailyManpowerConfig()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all bg-white text-slate-600 border border-slate-200 hover:bg-slate-50">
                                返回配置列表
                            </button>
                            <button onclick="DailyManpowerManager.saveComplexRules()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all bg-purple-600 text-white hover:bg-purple-700 shadow-sm">
                                保存配置
                            </button>
                        </div>
                    </div>
                </header>

                <main class="flex-1 overflow-auto p-6 relative pb-20">
                    <div class="max-w-[1600px] mx-auto space-y-6">
                        <!-- 组合规则 -->
                        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div class="bg-indigo-50 px-4 py-3 border-b border-slate-200">
                                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                    <span class="bg-indigo-100 text-indigo-700 w-6 h-6 flex items-center justify-center rounded text-xs font-mono">1</span>
                                    组合规则
                                </h3>
                            </div>
                            <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${comboRules.length === 0 ? '<div class="text-slate-400 text-sm italic col-span-full py-4 text-center">暂无组合规则</div>' : ''}
                                ${comboRules.map(rule => `
                                    <div class="p-4 rounded-xl border-2 border-slate-100 bg-white hover:border-indigo-200 hover:shadow-indigo-50 transition-all relative group shadow-sm">
                                        <div class="flex justify-between items-center mb-3">
                                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                                <input type="checkbox" 
                                                       id="rule_${rule.id}"
                                                       ${rule.enabled ? 'checked' : ''}
                                                       onchange="DailyManpowerManager.toggleRule('${rule.id}', this.checked)"
                                                       class="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 shrink-0">
                                                <label for="rule_${rule.id}" class="font-bold text-sm text-slate-700 line-clamp-1 cursor-pointer flex-1" title="${rule.name}">${rule.name}</label>
                                            </div>
                                        </div>
                                        <div class="text-xs font-mono text-slate-600 bg-slate-50 p-2 rounded mb-3 break-all leading-relaxed border border-slate-100">
                                            ${rule.expression}
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                ${rule.min !== null ? `
                                                    <div class="flex items-center gap-1">
                                                        <span class="text-[10px] text-slate-400">MIN:</span>
                                                        <input type="number" 
                                                               id="rule_${rule.id}_min"
                                                               value="${rule.min}"
                                                               min="0"
                                                               class="w-16 px-2 py-1 border border-slate-300 rounded text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                               onchange="DailyManpowerManager.updateRuleValue('${rule.id}', 'min', this.value)">
                                                    </div>
                                                ` : ''}
                                                ${rule.max !== null ? `
                                                    <div class="flex items-center gap-1">
                                                        <span class="text-[10px] text-slate-400">MAX:</span>
                                                        <input type="number" 
                                                               id="rule_${rule.id}_max"
                                                               value="${rule.max || ''}"
                                                               min="0"
                                                               class="w-16 px-2 py-1 border border-slate-300 rounded text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                               placeholder="∞"
                                                               onchange="DailyManpowerManager.updateRuleValue('${rule.id}', 'max', this.value)">
                                                    </div>
                                                ` : ''}
                                            </div>
                                            <span class="text-[10px] text-slate-400 font-mono">
                                                ${rule.min !== null ? rule.min : '0'} ~ ${rule.max !== null ? rule.max : '∞'}
                                            </span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 地点规则 -->
                        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div class="bg-emerald-50 px-4 py-3 border-b border-slate-200">
                                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                    <span class="bg-emerald-100 text-emerald-700 w-6 h-6 flex items-center justify-center rounded text-xs font-mono">2</span>
                                    地点规则
                                </h3>
                            </div>
                            <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${locationRules.length === 0 ? '<div class="text-slate-400 text-sm italic col-span-full py-4 text-center">暂无地点规则</div>' : ''}
                                ${locationRules.map(rule => `
                                    <div class="p-4 rounded-xl border-2 border-slate-100 bg-white hover:border-emerald-200 hover:shadow-emerald-50 transition-all relative group shadow-sm">
                                        <div class="flex justify-between items-center mb-3">
                                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                                <input type="checkbox" 
                                                       id="rule_${rule.id}"
                                                       ${rule.enabled ? 'checked' : ''}
                                                       onchange="DailyManpowerManager.toggleRule('${rule.id}', this.checked)"
                                                       class="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 shrink-0">
                                                <label for="rule_${rule.id}" class="font-bold text-sm text-slate-700 line-clamp-1 cursor-pointer flex-1" title="${rule.name}">${rule.name}</label>
                                            </div>
                                        </div>
                                        <div class="text-xs font-mono text-slate-600 bg-slate-50 p-2 rounded mb-3 break-all leading-relaxed border border-slate-100">
                                            ${rule.expression}
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                ${rule.min !== null ? `
                                                    <div class="flex items-center gap-1">
                                                        <span class="text-[10px] text-slate-400">MIN:</span>
                                                        <input type="number" 
                                                               id="rule_${rule.id}_min"
                                                               value="${rule.min}"
                                                               min="0"
                                                               class="w-16 px-2 py-1 border border-slate-300 rounded text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                               onchange="DailyManpowerManager.updateRuleValue('${rule.id}', 'min', this.value)">
                                                    </div>
                                                ` : ''}
                                                ${rule.max !== null ? `
                                                    <div class="flex items-center gap-1">
                                                        <span class="text-[10px] text-slate-400">MAX:</span>
                                                        <input type="number" 
                                                               id="rule_${rule.id}_max"
                                                               value="${rule.max || ''}"
                                                               min="0"
                                                               class="w-16 px-2 py-1 border border-slate-300 rounded text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                               placeholder="∞"
                                                               onchange="DailyManpowerManager.updateRuleValue('${rule.id}', 'max', this.value)">
                                                    </div>
                                                ` : ''}
                                            </div>
                                            <span class="text-[10px] text-slate-400 font-mono">
                                                ${rule.min !== null ? rule.min : '0'} ~ ${rule.max !== null ? rule.max : '∞'}
                                            </span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        `;
        
        scheduleTable.innerHTML = html;
    },
    
    /**
     * 更新基础职能配置
     */
    updateBaseFunction(slot, func, type, value) {
        // 这个函数会被内联调用，实际保存会在保存按钮点击时进行
        console.log(`更新基础职能: ${slot}_${func}_${type} = ${value}`);
    },
    
    /**
     * 更新业务职能配置
     */
    updateBusinessFunction(slot, func, type, value) {
        console.log(`更新业务职能: ${slot}_${func}_${type} = ${value}`);
    },
    
    /**
     * 切换规则启用状态
     */
    toggleRule(ruleId, enabled) {
        console.log(`切换规则 ${ruleId}: ${enabled}`);
    },
    
    /**
     * 更新规则值
     */
    updateRuleValue(ruleId, type, value) {
        console.log(`更新规则 ${ruleId} ${type}: ${value}`);
    },
    
    /**
     * 保存基础职能配置
     */
    async saveBaseFunctions() {
        try {
            // 关闭编辑器
            this.closeCellEditor();
            
            let config = await this.loadCurrentConfig();
            if (!config) {
                config = await this.createDefaultConfig();
            }
            
            // 从矩阵转换为旧格式
            const { baseFunctions, businessFunctions } = this.convertFromMatrix(this.matrix);
            
            config.baseFunctions = baseFunctions;
            // 如果业务职能配置存在，也更新
            if (businessFunctions) {
                config.businessFunctions = businessFunctions;
            }
            config.updatedAt = new Date().toISOString();
            await this.saveConfig(config);
            
            // 刷新配置列表（如果当前在配置列表视图）
            if (this.currentView === 'configs') {
                await this.renderConfigList();
            }
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('基础职能配置已保存', 'success');
            
            // 使用更友好的提示
            if (typeof DialogUtils !== 'undefined' && DialogUtils.alert) {
                DialogUtils.alert('基础职能配置已保存成功！');
            } else {
                alert('基础职能配置已保存成功！');
            }
        } catch (error) {
            console.error('保存基础职能配置失败:', error);
            const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert ? DialogUtils.alert : alert;
            alertFn('保存失败：' + error.message);
        }
    },
    
    /**
     * 保存业务职能配置
     */
    async saveBusinessFunctions() {
        try {
            // 关闭编辑器
            this.closeCellEditor();
            
            let config = await this.loadCurrentConfig();
            if (!config) {
                config = await this.createDefaultConfig();
            }
            
            // 从矩阵转换为旧格式
            const { baseFunctions, businessFunctions } = this.convertFromMatrix(this.matrix);
            
            config.businessFunctions = businessFunctions;
            // 如果基础职能配置存在，也更新
            if (baseFunctions) {
                config.baseFunctions = baseFunctions;
            }
            config.updatedAt = new Date().toISOString();
            await this.saveConfig(config);
            
            // 刷新配置列表（如果当前在配置列表视图）
            if (this.currentView === 'configs') {
                await this.renderConfigList();
            }
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('业务职能配置已保存', 'success');
            
            // 使用更友好的提示
            if (typeof DialogUtils !== 'undefined' && DialogUtils.alert) {
                DialogUtils.alert('业务职能配置已保存成功！');
            } else {
                alert('业务职能配置已保存成功！');
            }
        } catch (error) {
            console.error('保存业务职能配置失败:', error);
            const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert ? DialogUtils.alert : alert;
            alertFn('保存失败：' + error.message);
        }
    },
    
    /**
     * 保存复杂规则配置
     */
    async saveComplexRules() {
        try {
            const complexRules = this.getDefaultComplexRules().map(rule => {
                const checkbox = document.getElementById(`rule_${rule.id}`);
                const minInput = document.getElementById(`rule_${rule.id}_min`);
                const maxInput = document.getElementById(`rule_${rule.id}_max`);
                
                return {
                    ...rule,
                    enabled: checkbox ? checkbox.checked : rule.enabled,
                    min: minInput ? (minInput.value ? parseInt(minInput.value) : null) : rule.min,
                    max: maxInput ? (maxInput.value ? parseInt(maxInput.value) : null) : rule.max
                };
            });
            
            let config = await this.loadCurrentConfig();
            if (!config) {
                config = await this.createDefaultConfig();
            }
            
            config.complexRules = complexRules;
            config.updatedAt = new Date().toISOString();
            await this.saveConfig(config);
            
            // 刷新配置列表（如果当前在配置列表视图）
            if (this.currentView === 'configs') {
                await this.renderConfigList();
            }
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('复杂规则配置已保存', 'success');
            alert('复杂规则配置已保存成功！');
        } catch (error) {
            console.error('保存复杂规则配置失败:', error);
            alert('保存失败：' + error.message);
        }
    },
    
    /**
     * 创建默认配置
     */
    async createDefaultConfig() {
        return {
            configId: 'default',
            name: '默认配置',
            baseFunctions: this.getDefaultBaseFunctions(),
            businessFunctions: this.getDefaultBusinessFunctions(),
            complexRules: this.getDefaultComplexRules(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    },
    
    /**
     * 加载当前配置
     */
    async loadCurrentConfig() {
        const configId = this.currentConfigId || 'default';
        if (typeof DB !== 'undefined' && DB.db) {
            return await DB.loadDailyManpowerConfig(configId);
        }
        return null;
    },
    
    /**
     * 加载所有配置
     */
    async loadAllConfigs() {
        if (typeof DB !== 'undefined' && DB.db) {
            return await DB.loadAllDailyManpowerConfigs();
        }
        return [];
    },
    
    /**
     * 保存配置
     */
    async saveConfig(config) {
        // 更新修改时间
        config.updatedAt = new Date().toISOString();
        
        if (typeof DB !== 'undefined' && DB.db) {
            await DB.saveDailyManpowerConfig(config);
        }
    },
    
    /**
     * 创建新配置
     */
    async createNewConfig() {
        // 生成默认名称：排班配置-YYYYMMDD-HHmmss
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        const createYear = now.getFullYear();
        const createMonth = String(now.getMonth() + 1).padStart(2, '0');
        // 格式：排班配置-YYYYMMDD-HHmmss
        const defaultName = `排班配置-${createYear}${createMonth}${day}-${hour}${minute}${second}`;
        
        // 使用自定义输入对话框
        const showInputDialogFn = typeof DialogUtils !== 'undefined' && DialogUtils.showInputDialog 
            ? DialogUtils.showInputDialog.bind(DialogUtils)
            : (typeof showInputDialog !== 'undefined' ? showInputDialog : prompt);
        
        const name = await showInputDialogFn('请输入配置名称：', defaultName);
        if (!name || name.trim() === '') {
            return;
        }
        
        const configId = 'config_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const config = {
            configId,
            name: name.trim(),
            baseFunctions: this.getDefaultBaseFunctions(),
            businessFunctions: this.getDefaultBusinessFunctions(),
            complexRules: this.getDefaultComplexRules(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        
        await this.saveConfig(config);
        
        // 设置为激活状态
        if (typeof Store !== 'undefined') {
            Store.state.activeDailyManpowerConfigId = configId;
            Store.saveState();
        }
        
        this.currentConfigId = configId;
        await this.renderConfigList();
        
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('新配置已创建', 'success');
    },

    /**
     * 激活配置
     * @param {string} configId - 配置ID
     */
    async activateConfig(configId) {
        try {
            const config = await this.loadConfigById(configId);
            if (!config) {
                const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert 
                    ? DialogUtils.alert.bind(DialogUtils) 
                    : alert;
                alertFn('配置不存在');
                return;
            }

            // 设置激活状态
            if (typeof Store !== 'undefined') {
                Store.state.activeDailyManpowerConfigId = configId;
                Store.saveState();
            }
            
            this.currentConfigId = configId;
            await this.renderConfigList();
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置已激活', 'success');
        } catch (error) {
            const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert 
                ? DialogUtils.alert.bind(DialogUtils) 
                : alert;
            alertFn('激活失败：' + error.message);
        }
    },

    /**
     * 查看配置详情
     * @param {string} configId - 配置ID
     */
    async viewConfig(configId) {
        const config = await this.loadConfigById(configId);
        if (!config) {
            const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert 
                ? DialogUtils.alert.bind(DialogUtils) 
                : alert;
            alertFn('配置不存在');
            return;
        }

        // 保存原始配置快照
        this.originalConfigSnapshot = JSON.parse(JSON.stringify(config));
        this.currentConfigId = configId;
        this.currentView = 'baseFunctions';
        
        // 加载配置到当前工作区
        await this.loadConfig(configId);
        
        // 显示基础职能配置页面
        await this.showBaseFunctionsConfig();
    },

    /**
     * 编辑配置名称
     * @param {string} configId - 配置ID
     */
    async editConfigName(configId) {
        const config = await this.loadConfigById(configId);
        if (!config) {
            const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert 
                ? DialogUtils.alert.bind(DialogUtils) 
                : alert;
            alertFn('配置不存在');
            return;
        }

        // 使用自定义输入对话框
        const showInputDialogFn = typeof DialogUtils !== 'undefined' && DialogUtils.showInputDialog 
            ? DialogUtils.showInputDialog.bind(DialogUtils)
            : (typeof showInputDialog !== 'undefined' ? showInputDialog : prompt);
        
        const newName = await showInputDialogFn('请输入新的配置名称：', config.name);
        if (!newName || newName.trim() === '' || newName.trim() === config.name) {
            return;
        }

        try {
            config.name = newName.trim();
            config.updatedAt = new Date().toISOString();
            
            await this.saveConfig(config);
            await this.renderConfigList();
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置名称已更新', 'success');
        } catch (error) {
            const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert 
                ? DialogUtils.alert.bind(DialogUtils) 
                : alert;
            alertFn('更新失败：' + error.message);
        }
    },

    /**
     * 导入配置
     */
    importConfig() {
        console.log('DailyManpowerManager.importConfig 被调用');
        // 创建隐藏的文件输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                document.body.removeChild(fileInput);
                return;
            }

            try {
                // 显示加载状态
                const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                updateStatusFn('正在导入配置...', 'info');
                
                // 读取文件内容
                const text = await file.text();
                const importedConfig = JSON.parse(text);
                
                // 验证配置格式
                if (!importedConfig.baseFunctions || !importedConfig.businessFunctions || !importedConfig.complexRules) {
                    throw new Error('配置文件格式不正确');
                }
                
                // 创建新配置
                const now = new Date();
                const configId = 'config_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                // 生成默认名称：排班配置-导入-YYYYMMDD-HHmmss
                let defaultName = importedConfig.name;
                if (!defaultName) {
                    const day = String(now.getDate()).padStart(2, '0');
                    const hour = String(now.getHours()).padStart(2, '0');
                    const minute = String(now.getMinutes()).padStart(2, '0');
                    const second = String(now.getSeconds()).padStart(2, '0');
                    const createYear = now.getFullYear();
                    const createMonth = String(now.getMonth() + 1).padStart(2, '0');
                    // 格式：排班配置-导入-YYYYMMDD-HHmmss
                    defaultName = `排班配置-导入-${createYear}${createMonth}${day}-${hour}${minute}${second}`;
                }
                
                const config = {
                    configId,
                    name: defaultName,
                    baseFunctions: importedConfig.baseFunctions,
                    businessFunctions: importedConfig.businessFunctions,
                    complexRules: importedConfig.complexRules,
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString()
                };
                
                await this.saveConfig(config);
                await this.renderConfigList();
                
                updateStatusFn('配置导入成功', 'success');
            } catch (error) {
                console.error('导入配置失败:', error);
                const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                updateStatusFn('导入失败：' + error.message, 'error');
                alert('导入失败：' + error.message);
            } finally {
                document.body.removeChild(fileInput);
            }
        });
        
        // 触发文件选择
        document.body.appendChild(fileInput);
        fileInput.click();
    },
    
    /**
     * 加载配置（设置当前工作配置）
     */
    async loadConfig(configId) {
        this.currentConfigId = configId;
        const config = await this.loadConfigById(configId);
        if (config) {
            // 可以在这里将配置加载到当前工作区
            console.log('配置已加载:', configId);
        }
    },

    /**
     * 根据ID加载配置
     * @param {string} configId - 配置ID
     * @returns {Promise<Object>} 配置对象
     */
    async loadConfigById(configId) {
        if (typeof DB !== 'undefined' && DB.db) {
            return await DB.loadDailyManpowerConfig(configId);
        }
        return null;
    },
    
    /**
     * 复制配置（复制后自动为非激活状态）
     * @param {string} configId - 配置ID
     */
    async duplicateConfig(configId) {
        try {
            const config = await this.loadConfigById(configId);
            if (!config) {
                const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert 
                    ? DialogUtils.alert.bind(DialogUtils) 
                    : alert;
                alertFn('配置不存在');
                return;
            }
            
            const now = new Date();
            const newConfigId = 'config_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // 生成默认副本名称
            let defaultName = `${config.name} (副本)`;
            
            // 如果原名称包含YYYYMM前缀，保持前缀格式
            const nameMatch = config.name.match(/^(\d{6})[-_](.+)$/);
            if (nameMatch) {
                // 如果原名称有前缀，保持前缀并添加副本标识
                defaultName = `${nameMatch[1]}-${nameMatch[2]} (副本)`;
            }
            
            // 使用自定义输入对话框
            const showInputDialogFn = typeof DialogUtils !== 'undefined' && DialogUtils.showInputDialog 
                ? DialogUtils.showInputDialog.bind(DialogUtils)
                : (typeof showInputDialog !== 'undefined' ? showInputDialog : prompt);
            
            const newName = await showInputDialogFn('请输入副本名称：', defaultName);
            if (!newName || newName.trim() === '') {
                return;
            }
            
            const newConfig = {
                configId: newConfigId,
                name: newName.trim(),
                baseFunctions: JSON.parse(JSON.stringify(config.baseFunctions || this.getDefaultBaseFunctions())),
                businessFunctions: JSON.parse(JSON.stringify(config.businessFunctions || this.getDefaultBusinessFunctions())),
                complexRules: JSON.parse(JSON.stringify(config.complexRules || this.getDefaultComplexRules())),
                createdAt: now.toISOString(),
                updatedAt: now.toISOString()
            };
            
            await this.saveConfig(newConfig);
            // 复制后的配置自动为非激活状态（不设置activeDailyManpowerConfigId）
            await this.renderConfigList();
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置已复制（新配置为非激活状态）', 'success');
        } catch (error) {
            const alertFn = typeof DialogUtils !== 'undefined' && DialogUtils.alert 
                ? DialogUtils.alert.bind(DialogUtils) 
                : alert;
            alertFn('复制失败：' + error.message);
        }
    },
    
    /**
     * 删除配置（允许删除激活状态的配置）
     * @param {string} configId - 配置ID
     */
    async deleteConfig(configId) {
        const config = await this.loadConfigById(configId);
        const isActive = config && config.configId === Store.getState('activeDailyManpowerConfigId');
        const configs = await this.loadAllConfigs();
        
        // 如果是激活状态，提示用户
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
            await DB.deleteDailyManpowerConfig(configId);
            
            // 如果删除的是激活配置，清除激活状态
            if (isActive && typeof Store !== 'undefined') {
                Store.state.activeDailyManpowerConfigId = null;
                Store.saveState();
            }
            
            // 如果删除后没有配置了，重置当前视图
            const remainingConfigs = await this.loadAllConfigs();
            if (remainingConfigs.length === 0) {
                this.currentConfigId = null;
            }
            
            await this.renderConfigList();
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置已删除', 'success');
        } catch (error) {
            alert('删除失败：' + error.message);
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.DailyManpowerManager = DailyManpowerManager;
}

