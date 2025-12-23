/**
 * 排班规则配置管理器
 * 负责排班规则配置页面的显示和管理
 */

const RuleConfigManager = {
    currentView: 'rules', // 'rules' 规则配置列表
    currentRuleType: null, // 'nightShift' | 'dayShift' | 'scheduling'

    /**
     * 显示排班规则配置页面
     */
    async showRuleConfig() {
        this.currentView = 'rules';
        this.currentRuleType = null;
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            console.error('scheduleTable元素未找到');
            return;
        }

        // 更新视图状态
        if (typeof Store !== 'undefined') {
            Store.updateState({
                currentView: 'ruleConfig',
                currentSubView: null,
                currentConfigId: null
            }, false); // 不自动保存
        }

        // 更新排班周期控件的禁用状态（排班规则配置页面不允许修改排班周期）
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }

        // 初始化规则配置（如果尚未初始化）
        if (typeof NightShiftRules !== 'undefined') {
            await NightShiftRules.init();
        }
        if (typeof DayShiftRules !== 'undefined') {
            await DayShiftRules.init();
        }
        if (typeof SchedulingRules !== 'undefined') {
            await SchedulingRules.init();
        }

        const html = `
            <div class="p-6">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">排班规则配置</h2>
                
                <div class="space-y-4">
                    <!-- 夜班排班规则 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-semibold text-gray-800">夜班排班规则</h3>
                            <button onclick="RuleConfigManager.showNightShiftRules()" 
                                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                                配置规则
                            </button>
                        </div>
                        <p class="text-sm text-gray-600">配置夜班排班的各项规则，包括连续性安排、性别约束、生理期限制等</p>
                    </div>

                    <!-- 白班排班规则 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-semibold text-gray-800">白班排班规则</h3>
                            <button onclick="RuleConfigManager.showDayShiftRules()" 
                                    class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                                配置规则
                            </button>
                        </div>
                        <p class="text-sm text-gray-600">配置白班排班的各项规则，包括技能匹配、需求匹配、CSP约束等</p>
                    </div>

                    <!-- 排班顺序和优先级规则 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-semibold text-gray-800">排班顺序和优先级规则</h3>
                            <button onclick="RuleConfigManager.showSchedulingRules()" 
                                    class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm font-medium">
                                配置规则
                            </button>
                        </div>
                        <p class="text-sm text-gray-600">配置排班顺序、优先级权重、冲突解决策略等</p>
                    </div>
                </div>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 显示夜班排班规则配置
     */
    async showNightShiftRules() {
        this.currentView = 'nightShiftRules';
        this.currentRuleType = 'nightShift';

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }

        if (typeof NightShiftRules === 'undefined') {
            alert('夜班规则模块未加载');
            return;
        }

        const rules = NightShiftRules.getRules();
        const continuousRules = rules.continuousNightShift || {};
        const menstrualRules = rules.menstrualPeriodRestriction || {};
        const lactationRules = rules.lactationPregnancyRestriction || {};
        const reduceRules = rules.reduceNightShiftDays || {};
        const compensationRules = rules.lastMonthCompensation || {};
        const averageRules = rules.averageDistribution || {};

        const html = `
            <div class="p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">夜班排班规则配置</h2>
                    <button onclick="RuleConfigManager.showRuleConfig()" 
                            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                        返回规则列表
                    </button>
                </div>

                <form id="nightShiftRulesForm" class="space-y-6">
                    <!-- 大夜安排模式配置 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="RuleConfigManager.toggleRuleSection('nightShiftMain')">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" id="continuousEnabled" 
                                           ${continuousRules.enabled ? 'checked' : ''}
                                           onclick="event.stopPropagation();"
                                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="continuousEnabled" class="text-sm font-medium text-gray-700 cursor-pointer">
                                        启用大夜安排
                                    </label>
                                </div>
                                <svg id="nightShiftMainIcon" class="w-5 h-5 text-gray-400 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        
                        <div id="nightShiftMainContent" class="px-4 pb-4 hidden">
                        <div class="space-y-4 pt-2 border-t border-gray-200">

                            <!-- 大夜安排模式选择（连续/分散） -->
                            <div class="mt-4">
                                <label class="block text-sm font-medium text-gray-700 mb-3">安排模式</label>
                                <div class="space-y-3">
                                    <label class="flex items-center p-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input type="radio" name="arrangementMode" value="continuous" 
                                               ${continuousRules.arrangementMode === 'continuous' || continuousRules.arrangementMode === undefined ? 'checked' : ''}
                                               class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500">
                                        <span class="ml-3 text-sm font-medium text-gray-700">连续安排</span>
                                    </label>
                                    <label class="flex items-center p-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input type="radio" name="arrangementMode" value="distributed" 
                                               ${continuousRules.arrangementMode === 'distributed' ? 'checked' : ''}
                                               class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500">
                                        <span class="ml-3 text-sm font-medium text-gray-700">分散安排</span>
                                    </label>
                                </div>
                            </div>

                            <!-- 连续安排的次级选项 -->
                            <div class="mt-4" id="continuousOptionsContainer" style="display: ${continuousRules.arrangementMode === 'distributed' ? 'none' : 'block'};">
                                <div class="space-y-3">
                                    <div class="flex items-center space-x-3">
                                        <span class="text-sm text-gray-600 w-32">男性最大连续天数</span>
                                        <input type="number" id="maleDays" 
                                               value="${continuousRules.maleDays || 4}"
                                               min="1" max="7"
                                               class="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm">
                                    </div>
                                    <div class="flex items-center space-x-3">
                                        <span class="text-sm text-gray-600 w-32">女性最大连续天数</span>
                                        <input type="number" id="femaleDays" 
                                               value="${continuousRules.femaleDays || 3}"
                                               min="1" max="7"
                                               class="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm">
                                    </div>
                                </div>
                            </div>

                            <!-- 分散安排的次级选项 -->
                            <div class="mt-4" id="distributedOptionsContainer" style="display: ${continuousRules.arrangementMode === 'distributed' ? 'block' : 'none'};">
                                <div class="flex items-center space-x-3">
                                    <span class="text-sm text-gray-600">两次大夜最小间隔天数</span>
                                    <input type="number" id="minIntervalDays" 
                                           value="${continuousRules.minIntervalDays || 7}"
                                           min="1" max="30"
                                           class="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm">
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- 生理期时间段禁止排夜班 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="RuleConfigManager.toggleRuleSection('menstrual')">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" id="menstrualEnabled" 
                                           ${menstrualRules.enabled ? 'checked' : ''}
                                           onclick="event.stopPropagation();"
                                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="menstrualEnabled" class="text-sm font-medium text-gray-700 cursor-pointer">
                                        生理期时间段禁止排夜班
                                    </label>
                                </div>
                                <svg id="menstrualIcon" class="w-5 h-5 text-gray-400 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        <div id="menstrualContent" class="px-4 pb-4 hidden">
                            <p class="text-sm text-gray-500 pt-2 border-t border-gray-200">生理期时间段（上/下半月）禁止排夜班</p>
                        </div>
                    </div>

                    <!-- 哺乳期、孕妇不排大夜 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="RuleConfigManager.toggleRuleSection('lactation')">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" id="lactationEnabled" 
                                           ${lactationRules.enabled ? 'checked' : ''}
                                           onclick="event.stopPropagation();"
                                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="lactationEnabled" class="text-sm font-medium text-gray-700 cursor-pointer">
                                        哺乳期、孕妇不排大夜
                                    </label>
                                </div>
                                <svg id="lactationIcon" class="w-5 h-5 text-gray-400 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <!-- 人力满足情况下，部分人员适当减少1天大夜 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="RuleConfigManager.toggleRuleSection('reduce')">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" id="reduceEnabled" 
                                           ${reduceRules.enabled ? 'checked' : ''}
                                           onclick="event.stopPropagation();"
                                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="reduceEnabled" class="text-sm font-medium text-gray-700 cursor-pointer">
                                        启用减少大夜天数
                                    </label>
                                </div>
                                <svg id="reduceIcon" class="w-5 h-5 text-gray-400 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        <div id="reduceContent" class="px-4 pb-4 hidden">
                            <div class="pt-2 border-t border-gray-200">
                                <div class="flex items-center space-x-3">
                                    <span class="text-sm text-gray-600">人员比例</span>
                                    <input type="number" id="reductionRatio" 
                                           value="${reduceRules.reductionRatio || 0.2}"
                                           min="0" max="1" step="0.1"
                                           class="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 上月大夜4天的人员，本月优先减少 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="RuleConfigManager.toggleRuleSection('compensation')">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" id="compensationEnabled" 
                                           ${compensationRules.enabled ? 'checked' : ''}
                                           onclick="event.stopPropagation();"
                                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="compensationEnabled" class="text-sm font-medium text-gray-700 cursor-pointer">
                                        启用上月大夜补偿
                                    </label>
                                </div>
                                <svg id="compensationIcon" class="w-5 h-5 text-gray-400 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        <div id="compensationContent" class="px-4 pb-4 hidden">
                            <div class="pt-2 border-t border-gray-200">
                                <div class="flex items-center space-x-3">
                                    <span class="text-sm text-gray-600">天数阈值</span>
                                    <input type="number" id="priorityThreshold" 
                                           value="${compensationRules.priorityThreshold || 4}"
                                           min="1" max="7"
                                           class="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 全年大夜天数平均分配 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="RuleConfigManager.toggleRuleSection('average')">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" id="averageEnabled" 
                                           ${averageRules.enabled ? 'checked' : ''}
                                           onclick="event.stopPropagation();"
                                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="averageEnabled" class="text-sm font-medium text-gray-700 cursor-pointer">
                                        启用平均分配
                                    </label>
                                </div>
                                <svg id="averageIcon" class="w-5 h-5 text-gray-400 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        <div id="averageContent" class="px-4 pb-4 hidden">
                            <div class="pt-2 border-t border-gray-200">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" id="groupByGender" 
                                           ${averageRules.groupByGender ? 'checked' : ''}
                                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="groupByGender" class="text-sm font-medium text-gray-700">
                                        按性别分组
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="flex items-center justify-end space-x-4">
                        <button type="button" onclick="RuleConfigManager.resetNightShiftRules()" 
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                            重置为默认
                        </button>
                        <button type="button" onclick="RuleConfigManager.saveNightShiftRules()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            保存配置
                        </button>
                    </div>
                </form>
            </div>
        `;

        scheduleTable.innerHTML = html;

        // 绑定安排模式切换事件
        const arrangementModeRadios = document.querySelectorAll('input[name="arrangementMode"]');
        const continuousOptionsContainer = document.getElementById('continuousOptionsContainer');
        const distributedOptionsContainer = document.getElementById('distributedOptionsContainer');
        
        arrangementModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'distributed') {
                    // 显示分散安排选项，隐藏连续安排选项
                    if (distributedOptionsContainer) {
                        distributedOptionsContainer.style.display = 'block';
                    }
                    if (continuousOptionsContainer) {
                        continuousOptionsContainer.style.display = 'none';
                    }
                } else {
                    // 显示连续安排选项，隐藏分散安排选项
                    if (continuousOptionsContainer) {
                        continuousOptionsContainer.style.display = 'block';
                    }
                    if (distributedOptionsContainer) {
                        distributedOptionsContainer.style.display = 'none';
                    }
                }
            });
        });
    },

    /**
     * 保存夜班排班规则
     */
    async saveNightShiftRules() {
        try {
            const form = document.getElementById('nightShiftRulesForm');
            if (!form) {
                return;
            }

            const updates = {
                continuousNightShift: {
                    enabled: document.getElementById('continuousEnabled').checked,
                    maleDays: parseInt(document.getElementById('maleDays').value) || 4,
                    femaleDays: parseInt(document.getElementById('femaleDays').value) || 3,
                    arrangementMode: document.querySelector('input[name="arrangementMode"]:checked').value,
                    minIntervalDays: parseInt(document.getElementById('minIntervalDays').value) || 7
                },
                menstrualPeriodRestriction: {
                    enabled: document.getElementById('menstrualEnabled').checked
                },
                lactationPregnancyRestriction: {
                    enabled: document.getElementById('lactationEnabled').checked
                },
                reduceNightShiftDays: {
                    enabled: document.getElementById('reduceEnabled').checked,
                    reductionRatio: parseFloat(document.getElementById('reductionRatio').value) || 0.2
                },
                lastMonthCompensation: {
                    enabled: document.getElementById('compensationEnabled').checked,
                    priorityThreshold: parseInt(document.getElementById('priorityThreshold').value) || 4
                },
                averageDistribution: {
                    enabled: document.getElementById('averageEnabled').checked,
                    groupByGender: document.getElementById('groupByGender').checked
                }
            };

            await NightShiftRules.updateRules(updates);

            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('夜班规则配置已保存', 'success');
            alert('夜班规则配置已保存成功！');
        } catch (error) {
            console.error('保存夜班规则配置失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 重置夜班排班规则
     */
    async resetNightShiftRules() {
        if (confirm('确定要重置夜班规则配置为默认值吗？')) {
            await NightShiftRules.resetToDefault();
            await this.showNightShiftRules();
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('夜班规则配置已重置为默认值', 'success');
        }
    },

    /**
     * 显示白班排班规则配置
     */
    async showDayShiftRules() {
        this.currentView = 'dayShiftRules';
        this.currentRuleType = 'dayShift';

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }

        if (typeof DayShiftRules === 'undefined') {
            alert('白班规则模块未加载');
            return;
        }

        const rules = DayShiftRules.getRules();
        const skillRules = rules.skillMatching || {};
        const demandRules = rules.demandMatching || {};
        const cspRules = rules.cspSolver || {};
        const conflictRules = rules.avoidNightShiftConflict || {};

        const html = `
            <div class="p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">白班排班规则配置</h2>
                    <button onclick="RuleConfigManager.showRuleConfig()" 
                            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                        返回规则列表
                    </button>
                </div>

                <form id="dayShiftRulesForm" class="space-y-6">
                    <!-- 技能匹配约束 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">技能匹配约束</h3>
                        <div class="space-y-4">
                            <div class="flex items-center">
                                <input type="checkbox" id="skillEnabled" 
                                       ${skillRules.enabled ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="skillEnabled" class="ml-2 text-sm font-medium text-gray-700">
                                    启用技能匹配
                                </label>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">必需技能列表</label>
                                <div class="space-y-2">
                                    <label class="flex items-center">
                                        <input type="checkbox" value="网" 
                                               ${(skillRules.requiredSkills || []).includes('网') ? 'checked' : ''}
                                               class="skill-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                        <span class="ml-2 text-sm text-gray-700">网</span>
                                    </label>
                                    <label class="flex items-center">
                                        <input type="checkbox" value="天" 
                                               ${(skillRules.requiredSkills || []).includes('天') ? 'checked' : ''}
                                               class="skill-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                        <span class="ml-2 text-sm text-gray-700">天</span>
                                    </label>
                                    <label class="flex items-center">
                                        <input type="checkbox" value="微" 
                                               ${(skillRules.requiredSkills || []).includes('微') ? 'checked' : ''}
                                               class="skill-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                        <span class="ml-2 text-sm text-gray-700">微</span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">每个班次至少需要的技能覆盖数</label>
                                <input type="number" id="minSkillCoverage" 
                                       value="${skillRules.minSkillCoverage || 1}"
                                       min="1" max="3"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            </div>
                        </div>
                    </div>

                    <!-- 需求数量匹配 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">需求数量匹配</h3>
                        <div class="space-y-4">
                            <div class="flex items-center">
                                <input type="checkbox" id="demandEnabled" 
                                       ${demandRules.enabled ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="demandEnabled" class="ml-2 text-sm font-medium text-gray-700">
                                    启用需求匹配
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="matchByLocation" 
                                       ${demandRules.matchByLocation ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="matchByLocation" class="ml-2 text-sm font-medium text-gray-700">
                                    按地域匹配
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="matchByPersonType" 
                                       ${demandRules.matchByPersonType ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="matchByPersonType" class="ml-2 text-sm font-medium text-gray-700">
                                    按人员类型匹配
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- CSP约束求解 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">CSP约束求解</h3>
                        <div class="space-y-4">
                            <div class="flex items-center">
                                <input type="checkbox" id="cspEnabled" 
                                       ${cspRules.enabled ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="cspEnabled" class="ml-2 text-sm font-medium text-gray-700">
                                    启用CSP求解
                                </label>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">最大迭代次数</label>
                                    <input type="number" id="maxIterations" 
                                           value="${cspRules.maxIterations || 1000}"
                                           min="100" max="10000"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">回溯限制</label>
                                    <input type="number" id="backtrackLimit" 
                                           value="${cspRules.backtrackLimit || 100}"
                                           min="10" max="1000"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 避免与夜班冲突 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">避免与夜班冲突</h3>
                        <div class="flex items-center">
                            <input type="checkbox" id="conflictEnabled" 
                                   ${conflictRules.enabled ? 'checked' : ''}
                                   class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                            <label for="conflictEnabled" class="ml-2 text-sm font-medium text-gray-700">
                                启用避免与夜班冲突
                            </label>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="flex items-center justify-end space-x-4">
                        <button type="button" onclick="RuleConfigManager.resetDayShiftRules()" 
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                            重置为默认
                        </button>
                        <button type="button" onclick="RuleConfigManager.saveDayShiftRules()" 
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            保存配置
                        </button>
                    </div>
                </form>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 保存白班排班规则
     */
    async saveDayShiftRules() {
        try {
            const form = document.getElementById('dayShiftRulesForm');
            if (!form) {
                return;
            }

            const skillCheckboxes = document.querySelectorAll('.skill-checkbox:checked');
            const requiredSkills = Array.from(skillCheckboxes).map(cb => cb.value);

            const updates = {
                skillMatching: {
                    enabled: document.getElementById('skillEnabled').checked,
                    requiredSkills: requiredSkills.length > 0 ? requiredSkills : ['网', '天', '微'],
                    minSkillCoverage: parseInt(document.getElementById('minSkillCoverage').value) || 1
                },
                demandMatching: {
                    enabled: document.getElementById('demandEnabled').checked,
                    matchByLocation: document.getElementById('matchByLocation').checked,
                    matchByPersonType: document.getElementById('matchByPersonType').checked
                },
                cspSolver: {
                    enabled: document.getElementById('cspEnabled').checked,
                    maxIterations: parseInt(document.getElementById('maxIterations').value) || 1000,
                    backtrackLimit: parseInt(document.getElementById('backtrackLimit').value) || 100
                },
                avoidNightShiftConflict: {
                    enabled: document.getElementById('conflictEnabled').checked
                }
            };

            await DayShiftRules.updateRules(updates);

            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('白班规则配置已保存', 'success');
            alert('白班规则配置已保存成功！');
        } catch (error) {
            console.error('保存白班规则配置失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 重置白班排班规则
     */
    async resetDayShiftRules() {
        if (confirm('确定要重置白班规则配置为默认值吗？')) {
            await DayShiftRules.resetToDefault();
            await this.showDayShiftRules();
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('白班规则配置已重置为默认值', 'success');
        }
    },

    /**
     * 显示排班顺序和优先级规则配置
     */
    async showSchedulingRules() {
        this.currentView = 'schedulingRules';
        this.currentRuleType = 'scheduling';

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }

        if (typeof SchedulingRules === 'undefined') {
            alert('排班规则模块未加载');
            return;
        }

        const rules = SchedulingRules.getRules();
        const basicRules = rules.basicRestRules || {};
        const weights = rules.ruleWeights || {};
        const conflictRules = rules.conflictResolution || {};

        const html = `
            <div class="p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">排班顺序和优先级规则配置</h2>
                    <button onclick="RuleConfigManager.showRuleConfig()" 
                            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                        返回规则列表
                    </button>
                </div>

                <form id="schedulingRulesForm" class="space-y-6">
                    <!-- 排班顺序 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">排班顺序（按优先级从高到低）</h3>
                        <div id="schedulingOrderList" class="space-y-2">
                            ${rules.schedulingOrder.map((rule, index) => `
                                <div class="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                                    <span class="text-sm font-medium text-gray-700 w-8">${index + 1}</span>
                                    <span class="text-sm text-gray-800 flex-1">${this.getRuleDisplayName(rule)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <p class="mt-2 text-sm text-gray-500">排班将按照以上顺序依次处理各项规则</p>
                    </div>

                    <!-- 基础休息需求规则 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">基础休息需求规则</h3>
                        <div class="space-y-4">
                            <div class="flex items-center">
                                <input type="checkbox" id="basicRestEnabled" 
                                       ${basicRules.enabled ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="basicRestEnabled" class="ml-2 text-sm font-medium text-gray-700">
                                    启用基础休息需求规则
                                </label>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">最大指定休息日天数</label>
                                    <input type="number" id="maxRestDays" 
                                           value="${basicRules.maxRestDays || 3}"
                                           min="1" max="10"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">最大周末休息日天数</label>
                                    <input type="number" id="maxWeekendRestDays" 
                                           value="${basicRules.maxWeekendRestDays || 2}"
                                           min="1" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                </div>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="ensureLegalRestDays" 
                                       ${basicRules.ensureLegalRestDays ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="ensureLegalRestDays" class="ml-2 text-sm font-medium text-gray-700">
                                    确保全月休息日天数满足法定休息日天数
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="averageHolidayRestDays" 
                                       ${basicRules.averageHolidayRestDays ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="averageHolidayRestDays" class="ml-2 text-sm font-medium text-gray-700">
                                    节假休息天数平均分配
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="usePriorityScore" 
                                       ${basicRules.usePriorityScore ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="usePriorityScore" class="ml-2 text-sm font-medium text-gray-700">
                                    使用春节、国庆积分分配
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- 规则优先级权重 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">规则优先级权重（用于冲突解决）</h3>
                        <div class="space-y-3">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">个性化休假需求权重</label>
                                <input type="number" id="weightPersonalRequests" 
                                       value="${weights.personalRequests || 100}"
                                       min="0" max="200"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">基础休息需求规则权重</label>
                                <input type="number" id="weightBasicRestRules" 
                                       value="${weights.basicRestRules || 80}"
                                       min="0" max="200"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">夜班需求规则权重</label>
                                <input type="number" id="weightNightShiftRules" 
                                       value="${weights.nightShiftRules || 60}"
                                       min="0" max="200"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">白班排班约束权重</label>
                                <input type="number" id="weightDayShiftRules" 
                                       value="${weights.dayShiftRules || 40}"
                                       min="0" max="200"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            </div>
                        </div>
                    </div>

                    <!-- 冲突解决策略 -->
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">冲突解决策略</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">解决策略</label>
                                <div class="space-y-2">
                                    <label class="flex items-center">
                                        <input type="radio" name="conflictStrategy" value="priority" 
                                               ${conflictRules.strategy === 'priority' ? 'checked' : ''}
                                               class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500">
                                        <span class="ml-2 text-sm text-gray-700">按优先级</span>
                                    </label>
                                    <label class="flex items-center">
                                        <input type="radio" name="conflictStrategy" value="balance" 
                                               ${conflictRules.strategy === 'balance' ? 'checked' : ''}
                                               class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500">
                                        <span class="ml-2 text-sm text-gray-700">平衡分配</span>
                                    </label>
                                </div>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="allowOverride" 
                                       ${conflictRules.allowOverride ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="allowOverride" class="ml-2 text-sm font-medium text-gray-700">
                                    允许高优先级规则覆盖低优先级规则
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="flex items-center justify-end space-x-4">
                        <button type="button" onclick="RuleConfigManager.resetSchedulingRules()" 
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                            重置为默认
                        </button>
                        <button type="button" onclick="RuleConfigManager.saveSchedulingRules()" 
                                class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm font-medium">
                            保存配置
                        </button>
                    </div>
                </form>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 获取规则显示名称
     */
    getRuleDisplayName(ruleName) {
        const names = {
            'personalRequests': '个性化休假需求',
            'basicRestRules': '基础休息需求规则',
            'nightShiftRules': '夜班需求规则',
            'dayShiftRules': '白班排班约束'
        };
        return names[ruleName] || ruleName;
    },

    /**
     * 保存排班顺序和优先级规则
     */
    async saveSchedulingRules() {
        try {
            const form = document.getElementById('schedulingRulesForm');
            if (!form) {
                return;
            }

            const updates = {
                basicRestRules: {
                    enabled: document.getElementById('basicRestEnabled').checked,
                    maxRestDays: parseInt(document.getElementById('maxRestDays').value) || 3,
                    maxWeekendRestDays: parseInt(document.getElementById('maxWeekendRestDays').value) || 2,
                    ensureLegalRestDays: document.getElementById('ensureLegalRestDays').checked,
                    averageHolidayRestDays: document.getElementById('averageHolidayRestDays').checked,
                    usePriorityScore: document.getElementById('usePriorityScore').checked
                },
                ruleWeights: {
                    personalRequests: parseInt(document.getElementById('weightPersonalRequests').value) || 100,
                    basicRestRules: parseInt(document.getElementById('weightBasicRestRules').value) || 80,
                    nightShiftRules: parseInt(document.getElementById('weightNightShiftRules').value) || 60,
                    dayShiftRules: parseInt(document.getElementById('weightDayShiftRules').value) || 40
                },
                conflictResolution: {
                    strategy: document.querySelector('input[name="conflictStrategy"]:checked').value,
                    allowOverride: document.getElementById('allowOverride').checked
                }
            };

            await SchedulingRules.updateRules(updates);

            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('排班规则配置已保存', 'success');
            alert('排班规则配置已保存成功！');
        } catch (error) {
            console.error('保存排班规则配置失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 重置排班顺序和优先级规则
     */
    async resetSchedulingRules() {
        if (confirm('确定要重置排班规则配置为默认值吗？')) {
            await SchedulingRules.resetToDefault();
            await this.showSchedulingRules();
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('排班规则配置已重置为默认值', 'success');
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.RuleConfigManager = RuleConfigManager;
}

