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
    isRuleMode: false, // 是否处于规则编辑模式
    isCustomVarMode: false, // 是否处于自定义变量编辑模式
    editingRule: null, // 当前编辑的规则
    editingCustomVar: null, // 当前编辑的自定义变量
    addVariableToEditorRef: null, // 变量插入到编辑器的引用
    
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
     * 判断单元格是否被用户定义（非默认值）
     * @param {string} key - 单元格键
     * @returns {Object} { isDefined: boolean, isTotal: boolean, priority: number }
     *   - isDefined: 是否被明确定义（非默认值）
     *   - isTotal: 是否为合计类单元格
     *   - priority: 优先级（1=单独单元格最高, 2=指定合计, 3=默认计算）
     */
    getCellDefinitionStatus(key) {
        const cell = this.matrix[key];
        const isTotal = key.startsWith('SYS_COL_') || key.startsWith('SYS_ROW_') || key.startsWith('SYS_TOTAL_');
        
        // 检查是否有非默认值
        const hasValue = cell && (
            (cell.min !== null && cell.min !== undefined && cell.min !== 0) ||
            (cell.max !== null && cell.max !== undefined)
        );
        
        // 特殊处理：如果min和max都是0，也认为是被定义的（表示禁止）
        const isExplicitZero = cell && cell.min === 0 && cell.max === 0;
        
        const isDefined = hasValue || isExplicitZero;
        
        // 确定优先级
        let priority;
        if (!isTotal && isDefined) {
            // 单独单元格，已定义 - 最高优先级
            priority = 1;
        } else if (isTotal && isDefined) {
            // 合计单元格，已定义 - 次高优先级
            priority = 2;
        } else {
            // 未定义（使用默认或计算值）- 最低优先级
            priority = 3;
        }
        
        return { isDefined, isTotal, priority };
    },
    
    /**
     * 获取单元格的样式类（根据定义状态）
     * @param {string} key - 单元格键
     * @param {boolean} isConflict - 是否有冲突
     * @returns {string} CSS类字符串
     */
    getCellStyleClass(key, isConflict = false) {
        const status = this.getCellDefinitionStatus(key);
        
        if (isConflict) {
            // 冲突状态 - 黄色警告
            return 'bg-amber-100 border-amber-300 ring-1 ring-inset ring-amber-400';
        }
        
        if (status.isDefined) {
            if (status.isTotal) {
                // 已定义的合计单元格 - 紫色标记
                return 'bg-purple-50 border-purple-200 ring-1 ring-inset ring-purple-300';
            } else {
                // 已定义的单独单元格 - 蓝色标记
                return 'bg-blue-50 border-blue-200 ring-1 ring-inset ring-blue-300';
            }
        } else {
            if (status.isTotal) {
                // 未定义的合计单元格 - 灰色置灰
                return 'bg-gray-100 border-gray-200 text-gray-400';
            } else {
                // 未定义的单独单元格 - 默认样式
                return 'hover:bg-slate-50';
            }
        }
    },
    
    /**
     * 生成初始矩阵数据（角色×地点×技能）
     */
    generateInitialMatrix() {
        const data = {};
        this.ROLES.forEach(r => {
            this.LOCATIONS.forEach(l => {
                if (r === '大夜') {
                    data[`${r}_${l.id}_common`] = { min: 0, max: null };
                } else {
                    this.SKILLS.forEach(s => {
                        data[`${r}_${l.id}_${s.id}`] = { min: 0, max: null };
                    });
                }
            });
        });
        
        // 应用默认约束条件
        this.applyDefaultConstraints(data);
        
        return data;
    },
    
    /**
     * 应用默认约束条件到矩阵数据
     */
    applyDefaultConstraints(data) {
        // 应用基础变量约束（应用到合计单元格 SYS_COL_${role}_ALL_${skill}）
        const baseConstraints = {
            "A1_星": { "min": 0, "max": 1 },
            "A1_综": { "min": 0, "max": 0 },
            "A1_收": { "min": 0, "max": 0 },
            "A_星": { "min": 0, "max": 1 },
            "A_综": { "min": 0, "max": 1 },
            "A_收": { "min": 0, "max": 1 },
            "A2_星": { "min": 0, "max": 1 },
            "A2_综": { "min": 0, "max": 0 },
            "A2_收": { "min": 0, "max": 0 },
            "B1_星": { "min": 0, "max": 1 },
            "B1_综": { "min": 0, "max": 0 },
            "B1_收": { "min": 0, "max": 0 },
            "B2_星": { "min": 0, "max": 1 },
            "B2_综": { "min": 0, "max": 1 },
            "B2_收": { "min": 0, "max": 1 },
            "A1_网": { "min": 2, "max": 2 },
            "A_网": { "min": 2, "max": 2 },
            "A2_网": { "min": 2, "max": 2 },
            "B1_网": { "min": 2, "max": 2 },
            "B2_网": { "min": 2, "max": 2 },
            "A1_天": { "min": 0, "max": 0 },
            "A_天": { "min": 1, "max": 1 },
            "A2_天": { "min": 1, "max": 1 },
            "B1_天": { "min": 0, "max": 0 },
            "B2_天": { "min": 1, "max": 1 },
            "A1_微": { "min": 0, "max": 0 },
            "A_微": { "min": 1, "max": 1 },
            "A2_微": { "min": 1, "max": 1 },
            "B1_微": { "min": 1, "max": 2 },
            "B2_微": { "min": 1, "max": 2 },
            "A1_银B": { "min": 1, "max": 1 },
            "A_银B": { "min": 0, "max": 0 },
            "A2_银B": { "min": 0, "max": 0 },
            "B1_银B": { "min": 1, "max": 1 },
            "B2_银B": { "min": 1, "max": 1 },
            "A1_追": { "min": 0, "max": 0 },
            "A_追": { "min": 1, "max": 1 },
            "A2_追": { "min": 0, "max": 0 },
            "B1_追": { "min": 0, "max": 0 },
            "B2_追": { "min": 1, "max": 1 },
            "A1_毛": { "min": 1, "max": 1 },
            "A_毛": { "min": 0, "max": 0 },
            "A2_毛": { "min": 0, "max": 0 },
            "B1_毛": { "min": 0, "max": 0 },
            "B2_毛": { "min": 1, "max": 1 }
        };
        
        // 将基础变量约束应用到合计单元格和基础单元格
        Object.keys(baseConstraints).forEach(constraintKey => {
            const parts = constraintKey.split('_');
            const role = parts[0];
            const skillName = parts.slice(1).join('_');
            
            // 查找对应的技能ID
            const skill = this.SKILLS.find(s => s.name === skillName || s.id === skillName);
            if (skill) {
                const constraint = baseConstraints[constraintKey];
                
                // 应用到合计单元格
                const cellKey = `SYS_COL_${role}_ALL_${skill.id}`;
                data[cellKey] = {
                    min: constraint.min,
                    max: constraint.max === null ? null : constraint.max
                };
                
                // 应用到所有地点的基础单元格
                // 如果合计是固定值（min === max），则平均分配到各地点
                // 如果合计有范围，则基础单元格设置为 0-∞，让合计约束来控制
                this.LOCATIONS.forEach(loc => {
                    const baseCellKey = `${role}_${loc.id}_${skill.id}`;
                    if (constraint.min === constraint.max && constraint.max !== null) {
                        // 固定值：平均分配到各地点（向下取整，余数加到第一个地点）
                        const perLocation = Math.floor(constraint.max / this.LOCATIONS.length);
                        const remainder = constraint.max % this.LOCATIONS.length;
                        if (loc.id === this.LOCATIONS[0].id) {
                            data[baseCellKey] = { min: perLocation + remainder, max: perLocation + remainder };
                        } else {
                            data[baseCellKey] = { min: perLocation, max: perLocation };
                        }
                    } else {
                        // 有范围：基础单元格设置为 0-∞，让合计约束来控制
                        data[baseCellKey] = { min: 0, max: null };
                    }
                });
            }
        });
        
        // 应用地点约束（应用到纵向合计单元格 SYS_COL_${role}_${location}）
        // 这些约束表示该角色在该地点的所有技能合计
        const locationConstraints = {
            "A1_上海": { "min": 2, "max": null },
            "A_上海": { "min": 2, "max": null },
            "A2_上海": { "min": 1, "max": null },
            "B1_上海": { "min": 2, "max": null },
            "B2_上海": { "min": 3, "max": null },
            "大夜_上海": { "min": 1, "max": 2 },
            "大夜_成都": { "min": 1, "max": 2 }
        };
        
        // 地点名称映射：上海->SH, 成都->CD
        const locationMap = { "上海": "SH", "成都": "CD" };
        
        Object.keys(locationConstraints).forEach(constraintKey => {
            const parts = constraintKey.split('_');
            const role = parts[0];
            const locationName = parts.slice(1).join('_');
            const locationId = locationMap[locationName];
            
            if (locationId) {
                // 应用到纵向合计单元格（该角色在该地点的所有技能合计）
                const cellKey = `SYS_COL_${role}_${locationId}`;
                const constraint = locationConstraints[constraintKey];
                data[cellKey] = {
                    min: constraint.min,
                    max: constraint.max
                };
                
                // 如果角色不是大夜，地点约束会影响该角色在该地点的所有基础单元格
                // 但基础单元格的值应该由合计约束和地点约束共同决定
                // 这里只设置合计单元格，基础单元格保持 0-∞，让合计约束来控制
            }
        });
        
        // 大夜班合计约束（大夜_上海+大夜_成都）
        data['SYS_COL_大夜_ALL'] = { min: 3, max: 4 };
        
        // 大夜班基础单元格约束
        data['大夜_SH_common'] = { min: 1, max: 2 };
        data['大夜_CD_common'] = { min: 1, max: 2 };
        
        // 注意：SYS_COL_${role}_ALL 包括所有技能（星、综、收、网、天、微、银B、追、毛）
        // 因此不能用来替代只涉及部分技能（如星、综、收）的规则
        // 这些跨技能组合约束需要保留在规则列表中
    },
    
    /**
     * 应用所有约束条件到表格中
     */
    applyAllConstraints() {
        // 先重置所有值为0/∞
        this.resetAllValues();
        
        // 应用基础变量约束（应用到合计单元格 SYS_COL_${role}_ALL_${skill}）
        const baseConstraints = {
            "A1_星": { "min": 0, "max": 1 },
            "A1_综": { "min": 0, "max": 0 },
            "A1_收": { "min": 0, "max": 0 },
            "A_星": { "min": 0, "max": 1 },
            "A_综": { "min": 0, "max": 1 },
            "A_收": { "min": 0, "max": 1 },
            "A2_星": { "min": 0, "max": 1 },
            "A2_综": { "min": 0, "max": 0 },
            "A2_收": { "min": 0, "max": 0 },
            "B1_星": { "min": 0, "max": 1 },
            "B1_综": { "min": 0, "max": 0 },
            "B1_收": { "min": 0, "max": 0 },
            "B2_星": { "min": 0, "max": 1 },
            "B2_综": { "min": 0, "max": 1 },
            "B2_收": { "min": 0, "max": 1 },
            "A1_网": { "min": 2, "max": 2 },
            "A_网": { "min": 2, "max": 2 },
            "A2_网": { "min": 2, "max": 2 },
            "B1_网": { "min": 2, "max": 2 },
            "B2_网": { "min": 2, "max": 2 },
            "A1_天": { "min": 0, "max": 0 },
            "A_天": { "min": 1, "max": 1 },
            "A2_天": { "min": 1, "max": 1 },
            "B1_天": { "min": 0, "max": 0 },
            "B2_天": { "min": 1, "max": 1 },
            "A1_微": { "min": 0, "max": 0 },
            "A_微": { "min": 1, "max": 1 },
            "A2_微": { "min": 1, "max": 1 },
            "B1_微": { "min": 1, "max": 2 },
            "B2_微": { "min": 1, "max": 2 },
            "A1_银B": { "min": 1, "max": 1 },
            "A_银B": { "min": 0, "max": 0 },
            "A2_银B": { "min": 0, "max": 0 },
            "B1_银B": { "min": 1, "max": 1 },
            "B2_银B": { "min": 1, "max": 1 },
            "A1_追": { "min": 0, "max": 0 },
            "A_追": { "min": 1, "max": 1 },
            "A2_追": { "min": 0, "max": 0 },
            "B1_追": { "min": 0, "max": 0 },
            "B2_追": { "min": 1, "max": 1 },
            "A1_毛": { "min": 1, "max": 1 },
            "A_毛": { "min": 0, "max": 0 },
            "A2_毛": { "min": 0, "max": 0 },
            "B1_毛": { "min": 0, "max": 0 },
            "B2_毛": { "min": 1, "max": 1 }
        };
        
        // 将基础变量约束应用到合计单元格和基础单元格
        Object.keys(baseConstraints).forEach(constraintKey => {
            const parts = constraintKey.split('_');
            const role = parts[0];
            const skillName = parts.slice(1).join('_');
            
            // 查找对应的技能ID
            const skill = this.SKILLS.find(s => s.name === skillName || s.id === skillName);
            if (skill) {
                const constraint = baseConstraints[constraintKey];
                
                // 应用到合计单元格
                const cellKey = `SYS_COL_${role}_ALL_${skill.id}`;
                this.matrix[cellKey] = {
                    min: constraint.min,
                    max: constraint.max === null ? null : constraint.max
                };
                
                // 应用到所有地点的基础单元格
                // 如果合计是固定值（min === max），则平均分配到各地点
                // 如果合计有范围，则基础单元格设置为 0-∞，让合计约束来控制
                this.LOCATIONS.forEach(loc => {
                    const baseCellKey = `${role}_${loc.id}_${skill.id}`;
                    if (constraint.min === constraint.max && constraint.max !== null) {
                        // 固定值：平均分配到各地点（向下取整，余数加到第一个地点）
                        const perLocation = Math.floor(constraint.max / this.LOCATIONS.length);
                        const remainder = constraint.max % this.LOCATIONS.length;
                        if (loc.id === this.LOCATIONS[0].id) {
                            this.matrix[baseCellKey] = { min: perLocation + remainder, max: perLocation + remainder };
                        } else {
                            this.matrix[baseCellKey] = { min: perLocation, max: perLocation };
                        }
                    } else {
                        // 有范围：基础单元格设置为 0-∞，让合计约束来控制
                        this.matrix[baseCellKey] = { min: 0, max: null };
                    }
                });
            }
        });
        
        // 应用地点约束（应用到纵向合计单元格 SYS_COL_${role}_${location}）
        const locationConstraints = {
            "A1_上海": { "min": 2, "max": null }, // max是表达式，暂时设为null
            "A_上海": { "min": 2, "max": null },
            "A2_上海": { "min": 1, "max": null },
            "B1_上海": { "min": 2, "max": null },
            "B2_上海": { "min": 3, "max": null },
            "大夜_上海": { "min": 1, "max": 2 },
            "A1_成都": { "min": null, "max": null }, // 复杂表达式，暂时设为null
            "A_成都": { "min": null, "max": null },
            "A2_成都": { "min": null, "max": null },
            "B1_成都": { "min": null, "max": null },
            "B2_成都": { "min": null, "max": null },
            "大夜_成都": { "min": 1, "max": 2 }
        };
        
        // 地点名称映射：上海->SH, 成都->CD
        const locationMap = { "上海": "SH", "成都": "CD" };
        
        Object.keys(locationConstraints).forEach(constraintKey => {
            const parts = constraintKey.split('_');
            const role = parts[0];
            const locationName = parts.slice(1).join('_');
            const locationId = locationMap[locationName];
            
            if (locationId) {
                const cellKey = `SYS_COL_${role}_${locationId}`;
                const constraint = locationConstraints[constraintKey];
                this.matrix[cellKey] = {
                    min: constraint.min,
                    max: constraint.max
                };
            }
        });
        
        // 大夜班合计约束
        this.matrix['SYS_COL_大夜_ALL'] = { min: 3, max: 4 };
        
        // 注意：SYS_COL_${role}_ALL 包括所有技能（星、综、收、网、天、微、银B、追、毛）
        // 因此不能用来替代只涉及部分技能（如星、综、收）的规则
        // 这些跨技能组合约束需要保留在规则列表中
        
        // 应用规则约束（这些需要作为规则添加到 rules 数组）
        this.rules = [];
        this.groups = [{ id: 'g1', name: '组合约束', priority: 1 }, { id: 'g2', name: '业务约束', priority: 2 }];
        
        let ruleIdCounter = 1;
        
        // 辅助函数：生成变量表达式
        const v = (r, l, s) => {
            const loc = this.LOCATIONS.find(loc => loc.id === l);
            const skill = this.SKILLS.find(sk => sk.id === s);
            return `[${r}_${l}_${s}|${loc.name}_${r}_${skill ? skill.name : '通岗'}]`;
        };
        
        const sumSkill = (r, s) => `(${v(r,'SH',s)} + ${v(r,'CD',s)})`;
        
        // 组合约束规则
        const comboRules = [
            { name: 'A_星+A_综', logic: `${sumSkill('A','星')} + ${sumSkill('A','综')}`, min: 0, max: 1, groupId: 'g1' },
            { name: 'A_收+B2_综', logic: `${sumSkill('A','收')} + ${sumSkill('B2','综')}`, min: 0, max: 1, groupId: 'g1' },
            { name: 'A_综+B2_收', logic: `${sumSkill('A','综')} + ${sumSkill('B2','收')}`, min: 0, max: 1, groupId: 'g1' },
            { name: 'B2_星+B2_综', logic: `${sumSkill('B2','星')} + ${sumSkill('B2','综')}`, min: 0, max: 1, groupId: 'g1' },
            { name: 'A1_星+A1_综+A1_收', logic: `${sumSkill('A1','星')} + ${sumSkill('A1','综')} + ${sumSkill('A1','收')}`, min: 0, max: 1, groupId: 'g2' },
            { name: 'A_星+A_综+A_收', logic: `${sumSkill('A','星')} + ${sumSkill('A','综')} + ${sumSkill('A','收')}`, min: 0, max: 2, groupId: 'g2' },
            { name: 'A2_星+A2_综+A2_收', logic: `${sumSkill('A2','星')} + ${sumSkill('A2','综')} + ${sumSkill('A2','收')}`, min: 0, max: 1, groupId: 'g2' },
            { name: 'B1_星+B1_综+B1_收', logic: `${sumSkill('B1','星')} + ${sumSkill('B1','综')} + ${sumSkill('B1','收')}`, min: 0, max: 1, groupId: 'g2' },
            { name: 'B2_星+B2_综+B2_收', logic: `${sumSkill('B2','星')} + ${sumSkill('B2','综')} + ${sumSkill('B2','收')}`, min: 0, max: 3, groupId: 'g2' },
            { name: 'A2+B1业务合计', logic: `${sumSkill('A2','星')} + ${sumSkill('A2','综')} + ${sumSkill('A2','收')} + ${sumSkill('B1','星')} + ${sumSkill('B1','综')} + ${sumSkill('B1','收')}`, min: 1, max: 2, groupId: 'g2' },
            { name: 'A+B2业务合计', logic: `${sumSkill('A','星')} + ${sumSkill('A','综')} + ${sumSkill('A','收')} + ${sumSkill('B2','星')} + ${sumSkill('B2','综')} + ${sumSkill('B2','收')}`, min: 2, max: 6, groupId: 'g2' },
            { name: '全星级合计', logic: `${sumSkill('A1','星')} + ${sumSkill('A','星')} + ${sumSkill('A2','星')} + ${sumSkill('B1','星')} + ${sumSkill('B2','星')}`, min: 2, max: 5, groupId: 'g2' },
            { name: '全综合计', logic: `${sumSkill('A1','综')} + ${sumSkill('A','综')} + ${sumSkill('A2','综')} + ${sumSkill('B1','综')} + ${sumSkill('B2','综')}`, min: 1, max: 1, groupId: 'g2' },
            { name: '全收银合计', logic: `${sumSkill('A1','收')} + ${sumSkill('A','收')} + ${sumSkill('A2','收')} + ${sumSkill('B1','收')} + ${sumSkill('B2','收')}`, min: 1, max: 1, groupId: 'g2' }
            // 注意：大夜_上海+大夜_成都 规则已移除，因为约束已通过合计单元格 SYS_COL_大夜_ALL 控制
        ];
        
        comboRules.forEach(rule => {
            this.rules.push({
                id: `rule_${ruleIdCounter++}`,
                name: rule.name,
                logicRaw: `${rule.min} <= (${rule.logic}) <= ${rule.max}`,
                groupId: rule.groupId,
                enabled: true
            });
        });
        
        // 刷新显示
        this.refreshMatrixDisplay();
    },
    
    /**
     * 确保默认约束被应用（补充缺失的约束，不覆盖用户已修改的值）
     * 只在单元格不存在或值为默认值（0/null）时才应用约束
     */
    ensureDefaultConstraints() {
        // 基础变量约束
        const baseConstraints = {
            "A1_星": { "min": 0, "max": 1 },
            "A1_综": { "min": 0, "max": 0 },
            "A1_收": { "min": 0, "max": 0 },
            "A_星": { "min": 0, "max": 1 },
            "A_综": { "min": 0, "max": 1 },
            "A_收": { "min": 0, "max": 1 },
            "A2_星": { "min": 0, "max": 1 },
            "A2_综": { "min": 0, "max": 0 },
            "A2_收": { "min": 0, "max": 0 },
            "B1_星": { "min": 0, "max": 1 },
            "B1_综": { "min": 0, "max": 0 },
            "B1_收": { "min": 0, "max": 0 },
            "B2_星": { "min": 0, "max": 1 },
            "B2_综": { "min": 0, "max": 1 },
            "B2_收": { "min": 0, "max": 1 },
            "A1_网": { "min": 2, "max": 2 },
            "A_网": { "min": 2, "max": 2 },
            "A2_网": { "min": 2, "max": 2 },
            "B1_网": { "min": 2, "max": 2 },
            "B2_网": { "min": 2, "max": 2 },
            "A1_天": { "min": 0, "max": 0 },
            "A_天": { "min": 1, "max": 1 },
            "A2_天": { "min": 1, "max": 1 },
            "B1_天": { "min": 0, "max": 0 },
            "B2_天": { "min": 1, "max": 1 },
            "A1_微": { "min": 0, "max": 0 },
            "A_微": { "min": 1, "max": 1 },
            "A2_微": { "min": 1, "max": 1 },
            "B1_微": { "min": 1, "max": 2 },
            "B2_微": { "min": 1, "max": 2 },
            "A1_银B": { "min": 1, "max": 1 },
            "A_银B": { "min": 0, "max": 0 },
            "A2_银B": { "min": 0, "max": 0 },
            "B1_银B": { "min": 1, "max": 1 },
            "B2_银B": { "min": 1, "max": 1 },
            "A1_追": { "min": 0, "max": 0 },
            "A_追": { "min": 1, "max": 1 },
            "A2_追": { "min": 0, "max": 0 },
            "B1_追": { "min": 0, "max": 0 },
            "B2_追": { "min": 1, "max": 1 },
            "A1_毛": { "min": 1, "max": 1 },
            "A_毛": { "min": 0, "max": 0 },
            "A2_毛": { "min": 0, "max": 0 },
            "B1_毛": { "min": 0, "max": 0 },
            "B2_毛": { "min": 1, "max": 1 }
        };
        
        // 将基础变量约束应用到合计单元格和基础单元格
        Object.keys(baseConstraints).forEach(constraintKey => {
            const parts = constraintKey.split('_');
            const role = parts[0];
            const skillName = parts.slice(1).join('_');
            
            // 查找对应的技能ID
            const skill = this.SKILLS.find(s => s.name === skillName || s.id === skillName);
            if (skill) {
                const constraint = baseConstraints[constraintKey];
                
                // 应用到合计单元格（如果不存在或值为默认值）
                const cellKey = `SYS_COL_${role}_ALL_${skill.id}`;
                const existingCell = this.matrix[cellKey];
                if (!existingCell || (existingCell.min === 0 && (existingCell.max === null || existingCell.max === undefined))) {
                    this.matrix[cellKey] = {
                        min: constraint.min,
                        max: constraint.max === null ? null : constraint.max
                    };
                }
                
                // 应用到所有地点的基础单元格
                this.LOCATIONS.forEach(loc => {
                    const baseCellKey = `${role}_${loc.id}_${skill.id}`;
                    const existingBaseCell = this.matrix[baseCellKey];
                    
                    // 如果单元格不存在或值为默认值（0/null），才应用约束
                    if (!existingBaseCell || (existingBaseCell.min === 0 && (existingBaseCell.max === null || existingBaseCell.max === undefined))) {
                        if (constraint.min === constraint.max && constraint.max !== null) {
                            // 固定值：平均分配到各地点（向下取整，余数加到第一个地点）
                            const perLocation = Math.floor(constraint.max / this.LOCATIONS.length);
                            const remainder = constraint.max % this.LOCATIONS.length;
                            if (loc.id === this.LOCATIONS[0].id) {
                                this.matrix[baseCellKey] = { min: perLocation + remainder, max: perLocation + remainder };
                            } else {
                                this.matrix[baseCellKey] = { min: perLocation, max: perLocation };
                            }
                        } else {
                            // 有范围：基础单元格设置为 0-∞，让合计约束来控制
                            this.matrix[baseCellKey] = { min: 0, max: null };
                        }
                    }
                });
            }
        });
        
        // 应用地点约束（应用到纵向合计单元格）
        const locationConstraints = {
            "A1_上海": { "min": 2, "max": null },
            "A_上海": { "min": 2, "max": null },
            "A2_上海": { "min": 1, "max": null },
            "B1_上海": { "min": 2, "max": null },
            "B2_上海": { "min": 3, "max": null },
            "大夜_上海": { "min": 1, "max": 2 },
            "大夜_成都": { "min": 1, "max": 2 }
        };
        
        // 地点名称映射：上海->SH, 成都->CD
        const locationMap = { "上海": "SH", "成都": "CD" };
        
        Object.keys(locationConstraints).forEach(constraintKey => {
            const parts = constraintKey.split('_');
            const role = parts[0];
            const locationName = parts.slice(1).join('_');
            const locationId = locationMap[locationName];
            
            if (locationId) {
                const cellKey = `SYS_COL_${role}_${locationId}`;
                const existingCell = this.matrix[cellKey];
                const constraint = locationConstraints[constraintKey];
                
                // 如果单元格不存在或值为默认值，才应用约束
                if (!existingCell || (existingCell.min === 0 && (existingCell.max === null || existingCell.max === undefined))) {
                    this.matrix[cellKey] = {
                        min: constraint.min,
                        max: constraint.max
                    };
                }
            }
        });
        
        // 大夜班合计约束
        const nightTotalKey = 'SYS_COL_大夜_ALL';
        const existingNightTotal = this.matrix[nightTotalKey];
        if (!existingNightTotal || (existingNightTotal.min === 0 && (existingNightTotal.max === null || existingNightTotal.max === undefined))) {
            this.matrix[nightTotalKey] = { min: 3, max: 4 };
        }
        
        // 大夜班基础单元格约束
        const nightBaseConstraints = {
            '大夜_SH_common': { min: 1, max: 2 },
            '大夜_CD_common': { min: 1, max: 2 }
        };
        
        Object.keys(nightBaseConstraints).forEach(key => {
            const existingCell = this.matrix[key];
            const constraint = nightBaseConstraints[key];
            if (!existingCell || (existingCell.min === 0 && (existingCell.max === null || existingCell.max === undefined))) {
                this.matrix[key] = constraint;
            }
        });
    },
    
    /**
     * 重置所有单元格值为0到正无穷，并清除所有规则
     */
    resetAllValues() {
        // 重置所有基础单元格
        this.ROLES.forEach(r => {
            this.LOCATIONS.forEach(l => {
                if (r === '大夜') {
                    const key = `${r}_${l.id}_common`;
                    this.matrix[key] = { min: 0, max: null };
                } else {
                    this.SKILLS.forEach(s => {
                        const key = `${r}_${l.id}_${s.id}`;
                        this.matrix[key] = { min: 0, max: null };
                    });
                }
            });
        });
        
        // 重置所有合计单元格（SYS_COL_）
        Object.keys(this.matrix).forEach(key => {
            if (key.startsWith('SYS_COL_')) {
                this.matrix[key] = { min: 0, max: null };
            }
        });
        
        // 重置所有统计行单元格（SYS_ROW_）
        Object.keys(this.matrix).forEach(key => {
            if (key.startsWith('SYS_ROW_')) {
                this.matrix[key] = { min: 0, max: null };
            }
        });
        
        // 清除所有规则
        this.rules = [];
        this.groups = [];
        
        // 刷新显示
        this.refreshMatrixDisplay();
    },
    
    /**
     * 变量样式（用于芯片颜色）
     */
    getVariableStyle(key) {
        if (key.startsWith('SYS_')) return { chipBg: 'bg-purple-100', chipBorder: 'border-purple-300', chipText: 'text-purple-800' }; 
        if (key.startsWith('CUST_')) return { chipBg: 'bg-orange-100', chipBorder: 'border-orange-300', chipText: 'text-orange-800' }; 
        if (key.includes('_SH_')) return this.LOCATIONS[0];
        if (key.includes('_CD_')) return this.LOCATIONS[1];
        return { chipBg: 'bg-slate-100', chipBorder: 'border-slate-300', chipText: 'text-slate-800' };
    },

    /**
     * 提取表达式中的变量列表
     */
    extractVariables(logicString) {
        const vars = new Set();
        const parts = logicString.split(/(\[.*?\|.*?\])/g);
        parts.forEach(part => {
            const match = part.match(/^\[(.*?)\|(.*?)\]$/);
            if (match) vars.add(match[1]);
        });
        return Array.from(vars);
    },

    /**
     * 规则组（默认）
     */
    getDefaultGroups() {
        return [
            { id: 'g1', name: '一级硬性限制 (最高优先)', priority: 1 },
            { id: 'g2', name: '二级平衡目标', priority: 2 },
            { id: 'g3', name: '三级软性指标', priority: 3 }
        ];
    },

    /**
     * 生成默认规则（只包含组合约束规则，单个变量约束和地点约束已通过单元格约束应用）
     */
    generateDefaultRules() {
        // 初始化规则组
        if (!this.groups || this.groups.length === 0) {
            this.groups = [{ id: 'g1', name: '组合约束', priority: 1 }, { id: 'g2', name: '业务约束', priority: 2 }];
        }
        
        const rules = [];
        let idCounter = 1;
    
        const v = (r, l, s) => `[${r}_${l}_${s}|${this.LOCATIONS.find(loc=>loc.id===l).name}_${r}_${this.SKILLS.find(sk=>sk.id===s)?.name||'通岗'}]`;
        const sumSkill = (r, s) => `(${v(r,'SH',s)} + ${v(r,'CD',s)})`;
    
        const addComboRule = (name, logic, min, max, groupId = 'g1') => {
            rules.push({
                id: `rule_${idCounter++}`,
                name: name,
                logicRaw: `${min} <= (${logic}) <= ${max}`,
                groupId: groupId,
                enabled: true
            });
        };
    
        // 组合约束规则
        // 注意：SYS_COL_${role}_ALL 包括所有技能（星、综、收、网、天、微、银B、追、毛）
        // 因此不能用来替代只涉及部分技能（如星、综、收）的规则
        // 这些跨技能组合约束需要保留在规则列表中，因为它们无法在表格上直接展示
        
        // 单个角色内跨技能约束（涉及部分技能的组合，无法通过合计单元格展示）
        addComboRule('A_星+A_综', `${sumSkill('A','星')} + ${sumSkill('A','综')}`, 0, 1, 'g1');
        addComboRule('B2_星+B2_综', `${sumSkill('B2','星')} + ${sumSkill('B2','综')}`, 0, 1, 'g1');
        addComboRule('A1_星+A1_综+A1_收', `${sumSkill('A1','星')} + ${sumSkill('A1','综')} + ${sumSkill('A1','收')}`, 0, 1, 'g2');
        addComboRule('A_星+A_综+A_收', `${sumSkill('A','星')} + ${sumSkill('A','综')} + ${sumSkill('A','收')}`, 0, 2, 'g2');
        addComboRule('A2_星+A2_综+A2_收', `${sumSkill('A2','星')} + ${sumSkill('A2','综')} + ${sumSkill('A2','收')}`, 0, 1, 'g2');
        addComboRule('B1_星+B1_综+B1_收', `${sumSkill('B1','星')} + ${sumSkill('B1','综')} + ${sumSkill('B1','收')}`, 0, 1, 'g2');
        addComboRule('B2_星+B2_综+B2_收', `${sumSkill('B2','星')} + ${sumSkill('B2','综')} + ${sumSkill('B2','收')}`, 0, 3, 'g2');
        
        // 跨角色约束（无法通过单个合计单元格实现，需要保留规则）
        addComboRule('A_收+B2_综', `${sumSkill('A','收')} + ${sumSkill('B2','综')}`, 0, 1, 'g1');
        addComboRule('A_综+B2_收', `${sumSkill('A','综')} + ${sumSkill('B2','收')}`, 0, 1, 'g1');
        addComboRule('A2+B1业务合计', `${sumSkill('A2','星')} + ${sumSkill('A2','综')} + ${sumSkill('A2','收')} + ${sumSkill('B1','星')} + ${sumSkill('B1','综')} + ${sumSkill('B1','收')}`, 1, 2, 'g2');
        addComboRule('A+B2业务合计', `${sumSkill('A','星')} + ${sumSkill('A','综')} + ${sumSkill('A','收')} + ${sumSkill('B2','星')} + ${sumSkill('B2','综')} + ${sumSkill('B2','收')}`, 2, 6, 'g2');
        addComboRule('全星级合计', `${sumSkill('A1','星')} + ${sumSkill('A','星')} + ${sumSkill('A2','星')} + ${sumSkill('B1','星')} + ${sumSkill('B2','星')}`, 2, 5, 'g2');
        addComboRule('全综合计', `${sumSkill('A1','综')} + ${sumSkill('A','综')} + ${sumSkill('A2','综')} + ${sumSkill('B1','综')} + ${sumSkill('B2','综')}`, 1, 1, 'g2');
        addComboRule('全收银合计', `${sumSkill('A1','收')} + ${sumSkill('A','收')} + ${sumSkill('A2','收')} + ${sumSkill('B1','收')} + ${sumSkill('B2','收')}`, 1, 1, 'g2');
        
        // 大夜班规则已移除，因为约束已通过合计单元格 SYS_COL_大夜_ALL 控制
        // const sumNight = (loc) => `[大夜_${loc}_common|${this.LOCATIONS.find(l=>l.id===loc).name}_大夜_通岗]`;
        // addComboRule('大夜_上海+大夜_成都', `${sumNight('SH')} + ${sumNight('CD')}`, 3, 4, 'g1');
    
        // 直接赋值给 this.rules
        this.rules = rules;
        return rules;
    },

    /**
     * 转换旧格式规则（包含 && 的规则）为新格式（链式比较）
     * 例如：`min <= expr && expr <= max` -> `min <= expr <= max`
     */
    convertRuleToNewFormat(logicRaw) {
        if (!logicRaw || typeof logicRaw !== 'string') return logicRaw;
        
        // 检查是否包含 && 符号
        if (!logicRaw.includes('&&')) return logicRaw;
        
        // 匹配格式：`min <= expr && expr <= max`
        const pattern = /(\d+)\s*<=\s*([^&]+?)\s*&&\s*\2\s*<=\s*(\d+)/;
        const match = logicRaw.match(pattern);
        
        if (match) {
            const [, min, expr, max] = match;
            return `${min} <= ${expr.trim()} <= ${max}`;
        }
        
        // 匹配格式：`expr >= min && expr <= max` -> `min <= expr <= max`
        const pattern2 = /([^&]+?)\s*>=\s*(\d+)\s*&&\s*\1\s*<=\s*(\d+)/;
        const match2 = logicRaw.match(pattern2);
        
        if (match2) {
            const [, expr, min, max] = match2;
            return `${min} <= ${expr.trim()} <= ${max}`;
        }
        
        // 如果无法匹配，返回原格式（但移除 &&）
        return logicRaw.replace(/\s*&&\s*/g, ' ');
    },
    
    /**
     * 规则与变量状态准备（从配置或默认）
     */
    ensureRuleState(config) {
        // 确保groups被正确初始化（优先使用配置中的groups，否则使用默认值）
        if (config?.groups && config.groups.length > 0) {
            this.groups = config.groups;
        } else if (config?.ruleGroups && config.ruleGroups.length > 0) {
            this.groups = config.ruleGroups;
        } else if (!this.groups || this.groups.length === 0) {
            this.groups = this.getDefaultGroups();
        }
        
        // 确保rules被正确初始化（不清除现有规则，除非配置中没有规则）
        if (config?.rules && config.rules.length > 0) {
            // 转换旧格式规则为新格式
            this.rules = config.rules.map(rule => ({
                ...rule,
                logicRaw: this.convertRuleToNewFormat(rule.logicRaw)
            }));
        } else if (!this.rules || this.rules.length === 0) {
            // 应用默认规则约束
            this.generateDefaultRules();
        }
        
        // 确保customVars被正确初始化
        if (config?.customVars) {
            this.customVars = config.customVars;
        } else if (!this.customVars) {
            this.customVars = [];
        }
    },

    /**
     * 计算规则表达式的 min/max 区间
     */
    evaluateLogicRange(logicRaw, depth = 0) {
        if (depth > 5) return { min: 0, max: 0 }; 
        const stats = this.calculateStats();
        
        const resolveValue = (key, type) => {
            // 处理矩阵单元格变量（如：A1_SH_网、大夜_SH_common）
            if (this.matrix && this.matrix[key]) {
                const val = this.matrix[key][type];
                // 如果值为null或undefined，表示无约束
                // 最小值无约束返回0，最大值无约束返回Infinity
                if (val === null || val === undefined) {
                    // 检查是否有对应的合计单元格，如果有约束值，使用合计单元格的值
                    // 格式：${role}_${loc.id}_${skill.id} -> SYS_COL_${role}_ALL_${skill.id}
                    if (!key.startsWith('SYS_') && key.includes('_')) {
                        const parts = key.split('_');
                        if (parts.length >= 3) {
                            const role = parts[0];
                            const skillId = parts.slice(2).join('_');
                            const totalKey = `SYS_COL_${role}_ALL_${skillId}`;
                            if (this.matrix && this.matrix[totalKey]) {
                                const totalVal = this.matrix[totalKey][type];
                                // 如果合计单元格有值且不是默认值，使用合计单元格的值
                                // 注意：这里返回的是合计单元格的值，因为规则表达式使用的是 sumSkill，会计算所有地点的和
                                if (totalVal !== null && totalVal !== undefined) {
                                    return totalVal;
                                }
                            }
                        }
                    }
                    const defaultValue = type === 'min' ? 0 : Infinity;
                    return defaultValue;
                }
                return val;
            }
            
            // 如果基础单元格不存在，检查是否有对应的合计单元格
            if (!key.startsWith('SYS_') && key.includes('_')) {
                const parts = key.split('_');
                if (parts.length >= 3) {
                    const role = parts[0];
                    const skillId = parts.slice(2).join('_');
                    const totalKey = `SYS_COL_${role}_ALL_${skillId}`;
                    if (this.matrix && this.matrix[totalKey]) {
                        const totalVal = this.matrix[totalKey][type];
                        if (totalVal !== null && totalVal !== undefined) {
                            // 如果合计单元格有约束值，直接返回合计单元格的值
                            return totalVal;
                        }
                    }
                }
            }
            
            // 处理系统变量
            if (key.startsWith('SYS_')) {
                if (key.startsWith('SYS_TOTAL_')) { 
                    const sub = key.replace('SYS_TOTAL_', ''); 
                    // 优先检查matrix中是否有存储的值（总计单元格可能被用户编辑过）
                    if (this.matrix && this.matrix[key]) {
                        const val = this.matrix[key][type];
                        if (val === null || val === undefined) {
                            // 如果没有存储的值，使用计算的合计值
                            return stats.grandTotal[sub] ? stats.grandTotal[sub][type] : (type === 'min' ? 0 : Infinity);
                        }
                        return val;
                    }
                    // 如果没有存储的值，使用计算的合计值
                    return stats.grandTotal[sub] ? stats.grandTotal[sub][type] : (type === 'min' ? 0 : Infinity); 
                }
                if (key.startsWith('SYS_ROW_')) { 
                    const parts = key.split('_'); 
                    const locPart = parts[2]; 
                    const skillId = parts.slice(3).join('_'); 
                    const row = stats.rowStats[skillId]; 
                    return row ? (row[locPart] ? row[locPart][type] : (type === 'min' ? 0 : Infinity)) : (type === 'min' ? 0 : Infinity); 
                }
                if (key.startsWith('SYS_COL_')) { 
                    // 优先检查matrix中是否有存储的值（合计单元格可能被用户编辑过）
                    if (this.matrix && this.matrix[key]) {
                        const val = this.matrix[key][type];
                        if (val === null || val === undefined) {
                            // 如果没有存储的值，从统计中计算
                            const suffix = key.replace('SYS_COL_', ''); 
                            return stats.colStats[suffix] ? stats.colStats[suffix][type] : (type === 'min' ? 0 : Infinity);
                        }
                        return val;
                    }
                    // 如果没有存储的值，从统计中计算
                    const suffix = key.replace('SYS_COL_', ''); 
                    return stats.colStats[suffix] ? stats.colStats[suffix][type] : (type === 'min' ? 0 : Infinity); 
                }
            }
            
            // 处理自定义变量（递归）
            if (key.startsWith('CUST_')) { 
                const cv = this.customVars.find(c => c.id === key); 
                if (cv) { 
                    const res = this.evaluateLogicRange(cv.logicRaw, depth + 1); 
                    return res[type]; 
                } 
            }
            
            // 默认值：最小值0，最大值Infinity（无约束）
            return type === 'min' ? 0 : Infinity;
        };
        // 特殊处理 sumSkill 模式：([role_loc1_skill|...] + [role_loc2_skill|...]) 或 [role_loc1_skill|...] + [role_loc2_skill|...]
        // 对于这种模式，应该直接使用合计单元格的值，而不是计算两个变量的和
        const replaceVars = (str, type) => {
            let result = str;
            
            // 匹配 sumSkill 模式（带括号或不带括号）：
            // 1. ([role_loc1_skill|...] + [role_loc2_skill|...])
            // 2. [role_loc1_skill|...] + [role_loc2_skill|...]
            const sumSkillPatterns = [
                /\(\[([^|]+)\|([^\]]+)\]\s*\+\s*\[([^|]+)\|([^\]]+)\]\)/g,  // 带括号
                /\[([^|]+)\|([^\]]+)\]\s*\+\s*\[([^|]+)\|([^\]]+)\]/g       // 不带括号
            ];
            
            const matches = [];
            
            // 收集所有 sumSkill 模式的匹配
            sumSkillPatterns.forEach((pattern, patternIndex) => {
                let match;
                while ((match = pattern.exec(str)) !== null) {
                    matches.push({
                        fullMatch: match[0],
                        key1: match[1],
                        key2: match[3],
                        index: match.index,
                        hasParen: patternIndex === 0  // 第一个模式带括号
                    });
                }
            });
            
            // 从后往前替换，避免索引变化
            for (let i = matches.length - 1; i >= 0; i--) {
                const m = matches[i];
                const key1 = m.key1;
                const key2 = m.key2;
                
                // sumSkill 模式只适用于基础单元格（不是合计单元格），且是同一角色的同一技能在不同地点
                // 合计单元格（SYS_COL_开头）不应该被识别为 sumSkill 模式
                if (key1.startsWith('SYS_COL_') || key2.startsWith('SYS_COL_')) {
                    continue;
                }
                
                // 检查两个变量是否是同一角色的同一技能，只是地点不同
                if (!key1.startsWith('SYS_') && !key2.startsWith('SYS_') && key1.includes('_') && key2.includes('_')) {
                    const parts1 = key1.split('_');
                    const parts2 = key2.split('_');
                    if (parts1.length >= 3 && parts2.length >= 3) {
                        const role1 = parts1[0];
                        const skillId1 = parts1.slice(2).join('_');
                        const role2 = parts2[0];
                        const skillId2 = parts2.slice(2).join('_');
                        
                        // 如果是同一角色的同一技能，使用合计单元格的值
                        if (role1 === role2 && skillId1 === skillId2) {
                            // 特殊处理：大夜班的合计单元格是 SYS_COL_大夜_ALL，不是 SYS_COL_大夜_ALL_common
                            let totalKey;
                            if (skillId1 === 'common' && role1 === '大夜') {
                                totalKey = `SYS_COL_${role1}_ALL`;
                            } else {
                                totalKey = `SYS_COL_${role1}_ALL_${skillId1}`;
                            }
                            if (this.matrix && this.matrix[totalKey]) {
                                const totalVal = this.matrix[totalKey][type];
                                if (totalVal !== null && totalVal !== undefined) {
                                    // 替换整个 sumSkill 表达式为合计单元格的值
                                    result = result.substring(0, m.index) + totalVal + result.substring(m.index + m.fullMatch.length);
                                }
                            }
                        }
                    }
                }
            }
            
            // 对于其他变量，正常替换
            const finalResult = result.replace(/\[(.*?)\|(.*?)\]/g, (match, key) => {
                const value = resolveValue(key, type);
                return value;
            });
            return finalResult;
        };
        
        // 解析规则格式：min <= (expression) <= max
        // 例如：3 <= ([大夜_SH_common|...] + [大夜_CD_common|...]) <= 4
        // 或：0 <= (([B2_SH_星|...] + [B2_CD_星|...]) + ...) <= 3
        let ruleMin = null;
        let ruleMax = null;
        let expr = logicRaw;
        
        // 尝试匹配格式：min <= (expression) <= max
        const rulePattern = /^(\d+(?:\.\d+)?|∞|Infinity)?\s*<=\s*\(([^)]+)\)\s*<=\s*(\d+(?:\.\d+)?|∞|Infinity)?$/;
        const ruleMatch = logicRaw.match(rulePattern);
        
        if (ruleMatch) {
            // 提取规则的最小值和最大值约束
            const minStr = ruleMatch[1];
            const exprStr = ruleMatch[2];
            const maxStr = ruleMatch[3];
            
            if (minStr) {
                ruleMin = (minStr === '∞' || minStr === 'Infinity') ? Infinity : parseFloat(minStr);
            }
            if (maxStr) {
                ruleMax = (maxStr === '∞' || maxStr === 'Infinity') ? Infinity : parseFloat(maxStr);
            }
            expr = `(${exprStr})`;
        } else {
            // 如果没有匹配到规则格式，尝试提取表达式部分
            const compareIdx = logicRaw.search(/(>=|<=|==|!=|>|<|=)/);
            if (compareIdx !== -1) {
                // 查找第一个 <= 或 >= 之前的部分作为最小值约束
                const minMatch = logicRaw.match(/^(\d+(?:\.\d+)?|∞|Infinity)?\s*<=\s*/);
                if (minMatch && minMatch[1]) {
                    ruleMin = (minMatch[1] === '∞' || minMatch[1] === 'Infinity') ? Infinity : parseFloat(minMatch[1]);
                }
                // 查找最后一个 <= 或 >= 之后的部分作为最大值约束
                const maxMatch = logicRaw.match(/<=\s*(\d+(?:\.\d+)?|∞|Infinity)$/);
                if (maxMatch && maxMatch[1]) {
                    ruleMax = (maxMatch[1] === '∞' || maxMatch[1] === 'Infinity') ? Infinity : parseFloat(maxMatch[1]);
                }
                // 提取中间的表达式部分
                if (minMatch) {
                    expr = logicRaw.substring(minMatch[0].length);
                }
                if (maxMatch) {
                    expr = expr.substring(0, expr.length - maxMatch[0].length);
                }
                expr = expr.trim();
                // 去掉可能的括号
                if (expr.startsWith('(') && expr.endsWith(')')) {
                    expr = expr.substring(1, expr.length - 1);
                }
            }
        }
        
        if (!expr.trim()) {
            return { min: ruleMin !== null ? ruleMin : 0, max: ruleMax !== null ? ruleMax : Infinity };
        }
        
        const minExpr = replaceVars(expr, 'min');
        const maxExpr = replaceVars(expr, 'max');
        let exprMinVal = 0, exprMaxVal = 0;
        try { 
            // 确保Math对象在Function作用域中可用
            const minResult = new Function('Math', `return ${minExpr}`)(Math);
            exprMinVal = (minResult === null || minResult === undefined || isNaN(minResult)) ? 0 : minResult;
            
            // 对于最大值，需要特殊处理 Infinity
            // 如果表达式中包含 Infinity，计算结果应该是 Infinity
            if (maxExpr.includes('Infinity')) {
                // 检查是否所有项都是 Infinity，或者有 Infinity 参与运算
                // 对于加法运算，如果有任何一项是 Infinity，结果就是 Infinity
                exprMaxVal = Infinity;
            } else {
                const maxResult = new Function('Math', `return ${maxExpr}`)(Math);
                exprMaxVal = (maxResult === null || maxResult === undefined || isNaN(maxResult)) ? Infinity : maxResult;
            }
        } catch(e) {
            // 如果计算出错，检查是否是因为 Infinity
            if (maxExpr.includes('Infinity')) {
                exprMaxVal = Infinity;
            } else {
                exprMaxVal = Infinity;
            }
        }
        
        // 确保返回值是有效的数字
        if (isNaN(exprMinVal) || (!isFinite(exprMinVal) && exprMinVal !== Infinity)) exprMinVal = 0;
        if (isNaN(exprMaxVal) || (!isFinite(exprMaxVal) && exprMaxVal !== Infinity)) exprMaxVal = Infinity;
        
        // 收集所有表达式来源的最小值和最大值
        // 对于表达式中的每个部分（变量或 sumSkill），收集其来源的最小值和最大值
        const sourceMins = [];
        const sourceMaxs = [];
        
        // 从表达式中提取所有变量和 sumSkill 模式，收集它们的来源约束
        const extractSources = (exprStr) => {
            const sources = [];
            
            // 先提取 sumSkill 模式（带括号或不带括号）
            const sumSkillPatterns = [
                /\(\[([^|]+)\|([^\]]+)\]\s*\+\s*\[([^|]+)\|([^\]]+)\]\)/g,
                /\[([^|]+)\|([^\]]+)\]\s*\+\s*\[([^|]+)\|([^\]]+)\]/g
            ];
            
            const processedKeys = new Set();
            
            sumSkillPatterns.forEach((pattern) => {
                let match;
                while ((match = pattern.exec(exprStr)) !== null) {
                    const key1 = match[1];
                    const key2 = match[3];
                    if (!key1.startsWith('SYS_') && !key2.startsWith('SYS_') && key1.includes('_') && key2.includes('_')) {
                        const parts1 = key1.split('_');
                        const parts2 = key2.split('_');
                        if (parts1.length >= 3 && parts2.length >= 3) {
                            const role1 = parts1[0];
                            const skillId1 = parts1.slice(2).join('_');
                            const role2 = parts2[0];
                            const skillId2 = parts2.slice(2).join('_');
                            if (role1 === role2 && skillId1 === skillId2) {
                                // 对于 sumSkill，收集基础单元格的值（用于计算表达式范围）
                                if (!processedKeys.has(key1) && this.matrix && this.matrix[key1]) {
                                    sources.push({
                                        type: 'base',
                                        key: key1,
                                        cell: this.matrix[key1]
                                    });
                                    processedKeys.add(key1);
                                }
                                if (!processedKeys.has(key2) && this.matrix && this.matrix[key2]) {
                                    sources.push({
                                        type: 'base',
                                        key: key2,
                                        cell: this.matrix[key2]
                                    });
                                    processedKeys.add(key2);
                                }
                                
                                // 同时收集合计单元格的约束（用于与规则约束取交集）
                                let totalKey;
                                if (skillId1 === 'common' && role1 === '大夜') {
                                    totalKey = `SYS_COL_${role1}_ALL`;
                                } else {
                                    totalKey = `SYS_COL_${role1}_ALL_${skillId1}`;
                                }
                                if (this.matrix && this.matrix[totalKey] && !processedKeys.has(totalKey)) {
                                    sources.push({
                                        type: 'total',
                                        key: totalKey,
                                        cell: this.matrix[totalKey]
                                    });
                                    processedKeys.add(totalKey);
                                }
                            }
                        }
                    }
                }
            });
            
            // 提取其他变量（不在 sumSkill 中的）
            const varPattern = /\[([^|]+)\|([^\]]+)\]/g;
            let varMatch;
            while ((varMatch = varPattern.exec(exprStr)) !== null) {
                const key = varMatch[1];
                
                // 合计单元格（SYS_COL_开头）不应该被 sumSkill 模式处理，需要单独处理
                if (key.startsWith('SYS_COL_')) {
                    // 跳过 sumSkill 检查，直接处理合计单元格
                } else {
                    // 跳过已经在 sumSkill 中处理的变量
                    let isInSumSkill = false;
                    sumSkillPatterns.forEach((pattern) => {
                        const testStr = exprStr;
                        let testMatch;
                        while ((testMatch = pattern.exec(testStr)) !== null) {
                            if (testMatch[1] === key || testMatch[3] === key) {
                                isInSumSkill = true;
                                break;
                            }
                        }
                    });
                    
                    if (isInSumSkill || processedKeys.has(key)) {
                        continue;
                    }
                }
                
                if (processedKeys.has(key)) {
                    continue;
                }
                
                // 处理合计单元格 SYS_COL_${role}_ALL_${skill}：拆解为基础单元格
                if (key.startsWith('SYS_COL_') && key.includes('_ALL_')) {
                    // 格式：SYS_COL_${role}_ALL_${skill}
                    const parts = key.replace('SYS_COL_', '').split('_ALL_');
                    if (parts.length === 2) {
                        const role = parts[0];
                        const skillId = parts[1];
                        
                        // 拆解为所有地点的基础单元格
                        this.LOCATIONS.forEach(loc => {
                            const baseKey = `${role}_${loc.id}_${skillId}`;
                            if (this.matrix && this.matrix[baseKey] && !processedKeys.has(baseKey)) {
                                sources.push({
                                    type: 'base',
                                    key: baseKey,
                                    cell: this.matrix[baseKey]
                                });
                                processedKeys.add(baseKey);
                            }
                        });
                        
                        // 同时收集合计单元格的约束（用于与规则约束取交集）
                        if (this.matrix && this.matrix[key] && !processedKeys.has(key)) {
                            sources.push({
                                type: 'total',
                                key: key,
                                cell: this.matrix[key]
                            });
                            processedKeys.add(key);
                        }
                    }
                } else if (key.startsWith('SYS_COL_') && key.endsWith('_ALL') && !key.includes('_ALL_')) {
                    // 格式：SYS_COL_${role}_ALL（大夜班等特殊情况）
                    const role = key.replace('SYS_COL_', '').replace('_ALL', '');
                    // 对于大夜班，拆解为基础单元格
                    if (role === '大夜') {
                        this.LOCATIONS.forEach(loc => {
                            const baseKey = `大夜_${loc.id}_common`;
                            if (this.matrix && this.matrix[baseKey] && !processedKeys.has(baseKey)) {
                                sources.push({
                                    type: 'base',
                                    key: baseKey,
                                    cell: this.matrix[baseKey]
                                });
                                processedKeys.add(baseKey);
                            }
                        });
                    } else {
                        // 其他角色：拆解为所有技能在所有地点的基础单元格
                        this.SKILLS.forEach(skill => {
                            this.LOCATIONS.forEach(loc => {
                                const baseKey = `${role}_${loc.id}_${skill.id}`;
                                if (this.matrix && this.matrix[baseKey] && !processedKeys.has(baseKey)) {
                                    sources.push({
                                        type: 'base',
                                        key: baseKey,
                                        cell: this.matrix[baseKey]
                                    });
                                    processedKeys.add(baseKey);
                                }
                            });
                        });
                    }
                    
                    // 同时收集合计单元格的约束
                    if (this.matrix && this.matrix[key] && !processedKeys.has(key)) {
                        sources.push({
                            type: 'total',
                            key: key,
                            cell: this.matrix[key]
                        });
                        processedKeys.add(key);
                    }
                } else if (!key.startsWith('SYS_') && !processedKeys.has(key)) {
                    // 普通基础单元格
                    if (this.matrix && this.matrix[key]) {
                        sources.push({
                            type: 'base',
                            key: key,
                            cell: this.matrix[key]
                        });
                        processedKeys.add(key);
                    }
                }
            }
            
            return sources;
        };
        
        const sources = extractSources(expr);
        
        // 分离基础单元格和合计单元格
        const baseCells = sources.filter(s => s.type === 'base');
        const totalCells = sources.filter(s => s.type === 'total');
        
        // 从基础单元格计算表达式范围（用于与规则约束取交集）
        // 注意：这里使用基础单元格的实际值，如果为 null/undefined，使用默认值（min=0, max=Infinity）
        // 合计单元格的约束会在后面单独处理
        const baseMins = [];
        const baseMaxs = [];
        baseCells.forEach(source => {
            const cell = source.cell;
            if (cell) {
                const cellMin = cell.min;
                const cellMax = cell.max;
                // 对于最小值：如果基础单元格值为 null/undefined，使用 0（默认值）
                if (cellMin === null || cellMin === undefined) {
                    baseMins.push(0);
                } else {
                    baseMins.push(cellMin);
                }
                // 对于最大值：如果基础单元格值为 null/undefined，使用 Infinity（无约束）
                if (cellMax === null || cellMax === undefined) {
                    baseMaxs.push(Infinity);
                } else {
                    baseMaxs.push(cellMax);
                }
            }
        });
        
        // 如果没有基础单元格，使用表达式计算的结果
        if (baseMins.length === 0) {
            baseMins.push(exprMinVal);
        }
        if (baseMaxs.length === 0) {
            baseMaxs.push(exprMaxVal);
        }
        
        // 计算表达式范围：所有基础单元格的和
        const exprMinFromBase = baseMins.reduce((sum, val) => sum + val, 0);
        const exprMaxFromBase = baseMaxs.some(v => v === Infinity) 
            ? Infinity 
            : baseMaxs.reduce((sum, val) => sum + val, 0);
        
        // 收集合计单元格的约束值
        totalCells.forEach(source => {
            const cell = source.cell;
            if (cell) {
                const totalMin = cell.min;
                const totalMax = cell.max;
                if (totalMin !== null && totalMin !== undefined) {
                    sourceMins.push(totalMin);
                }
                if (totalMax !== null && totalMax !== undefined) {
                    sourceMaxs.push(totalMax);
                }
            }
        });
        
        // 计算最终的最小值和最大值
        // 最小值：max(表达式最小值(由基础单元格计算), 合计单元格最小值)
        const allMins = [exprMinFromBase, ...sourceMins];
        let finalMin = allMins.length > 0 ? Math.max(...allMins) : 0;
        
        // 最大值：min(表达式最大值(由基础单元格计算), 合计单元格最大值之和)
        // 注意：如果表达式最大值是 Infinity，计算所有合计单元格最大值的和
        let finalMax;
        if (exprMaxFromBase === Infinity) {
            // 表达式最大值是 Infinity，计算所有合计单元格最大值的和
            if (sourceMaxs.length > 0) {
                // 如果合计单元格最大值中有 Infinity，结果是 Infinity
                if (sourceMaxs.some(v => v === Infinity)) {
                    finalMax = Infinity;
                } else {
                    // 计算所有合计单元格最大值的和
                    finalMax = sourceMaxs.reduce((sum, val) => sum + val, 0);
                }
            } else {
                finalMax = Infinity;
            }
        } else {
            // 表达式最大值是有限值，与合计单元格最大值之和取较小者
            const totalMaxSum = sourceMaxs.length > 0 
                ? (sourceMaxs.some(v => v === Infinity) 
                    ? Infinity
                    : sourceMaxs.reduce((sum, val) => sum + val, 0))
                : Infinity;
            const allMaxs = [exprMaxFromBase, totalMaxSum];
            finalMax = allMaxs.length > 0 
                ? (allMaxs.some(v => v === Infinity) 
                    ? (allMaxs.filter(v => v !== Infinity).length > 0 
                        ? Math.min(...allMaxs.filter(v => v !== Infinity))
                        : Infinity)
                    : Math.min(...allMaxs))
                : Infinity;
        }
        
        // 与规则约束取交集
        // 注意：规则范围应该显示表达式本身可以达到的范围，而不是规则约束的范围
        // 规则约束（如 2 <= 表达式 <= 5）只是定义了规则的有效范围，但不应该限制表达式范围的计算
        // 表达式范围应该基于基础单元格和合计单元格的约束来计算，不受规则约束限制
        // 因此，这里不应用规则的最小值约束，只应用最大值约束
        // 如果用户需要知道规则的有效范围，可以在规则状态计算时单独处理
        if (ruleMax !== null && ruleMax !== undefined) {
            if (ruleMax !== Infinity) {
                if (finalMax === Infinity || finalMax === -Infinity) {
                    finalMax = ruleMax;
                } else {
                    finalMax = Math.min(finalMax, ruleMax);
                }
            }
        }
        
        return { min: finalMin, max: finalMax };
    },

    /**
     * 解析规则中的 min 和 max 值（从 logicRaw 格式：min <= (expression) <= max）
     */
    parseRuleMinMax(logicRaw) {
        try {
            // 匹配格式：min <= (expression) <= max
            // 支持多种格式：数字、∞、Infinity
            const match = logicRaw.match(/^(\d+(?:\.\d+)?|∞|Infinity)\s*<=\s*\([^)]+\)\s*<=\s*(\d+(?:\.\d+)?|∞|Infinity)$/);
            if (match) {
                const minStr = match[1].trim();
                const maxStr = match[2].trim();
                
                const min = (minStr === '∞' || minStr === 'Infinity') ? Infinity : parseFloat(minStr);
                const max = (maxStr === '∞' || maxStr === 'Infinity') ? Infinity : parseFloat(maxStr);
                
                if (!isNaN(min) && !isNaN(max)) {
                    return { min, max };
                }
            }
        } catch (e) {
            console.warn('解析规则范围失败:', e);
        }
        return { min: null, max: null };
    },

    computeRuleStatus() {
        if (!this.rules || this.rules.length === 0) return { processedRules: [], cellConflictStatus: {}, groupStatus: {} };
        const stats = this.calculateStats();
        const ruleResults = this.rules.map(rule => {
            // 检查规则本身的逻辑矛盾（min > max）
            const { min: ruleMin, max: ruleMax } = this.parseRuleMinMax(rule.logicRaw);
            let hasLogicError = false;
            if (ruleMin !== null && ruleMax !== null && ruleMin !== Infinity && ruleMax !== Infinity) {
                if (ruleMin > ruleMax) {
                    hasLogicError = true;
                    console.warn(`规则 ${rule.id} (${rule.name}) 存在逻辑矛盾：最小值 ${ruleMin} 大于最大值 ${ruleMax}`);
                }
            } else if (ruleMin === Infinity && ruleMax !== Infinity && ruleMax !== null) {
                hasLogicError = true;
                console.warn(`规则 ${rule.id} (${rule.name}) 存在逻辑矛盾：最小值是无穷大，而最大值是有限值 ${ruleMax}`);
            }
            
            const { min, max } = this.evaluateLogicRange(rule.logicRaw);
            const statsForRule = this.calculateStats();
            const resolveFull = (type) => rule.logicRaw.replace(/\[(.*?)\|(.*?)\]/g, (match, key) => {
                // 处理矩阵单元格变量（如：A1_SH_网、大夜_SH_common）
                if (this.matrix && this.matrix[key]) {
                    const val = this.matrix[key][type];
                    // 如果值为null或undefined，表示无约束
                    if (val === null || val === undefined) {
                        // 检查是否有对应的合计单元格，如果有约束值，使用合计单元格的值
                        // 格式：${role}_${loc.id}_${skill.id} -> SYS_COL_${role}_ALL_${skill.id}
                        if (!key.startsWith('SYS_') && key.includes('_')) {
                            const parts = key.split('_');
                            if (parts.length >= 3) {
                                const role = parts[0];
                                const skillId = parts.slice(2).join('_');
                                const totalKey = `SYS_COL_${role}_ALL_${skillId}`;
                                if (this.matrix && this.matrix[totalKey]) {
                                    const totalVal = this.matrix[totalKey][type];
                                    // 如果合计单元格有值，使用合计单元格的值
                                    // 因为 sumSkill 会计算所有地点的和，所以应该使用合计单元格的值
                                    if (totalVal !== null && totalVal !== undefined) {
                                        return totalVal === Infinity ? 'Infinity' : totalVal;
                                    }
                                }
                            }
                        }
                        return type === 'min' ? 0 : 'Infinity';
                    }
                    return val === Infinity ? 'Infinity' : val;
                }
                
                // 如果基础单元格不存在，检查是否有对应的合计单元格
                if (!key.startsWith('SYS_') && key.includes('_')) {
                    const parts = key.split('_');
                    if (parts.length >= 3) {
                        const role = parts[0];
                        const skillId = parts.slice(2).join('_');
                        const totalKey = `SYS_COL_${role}_ALL_${skillId}`;
                        if (this.matrix && this.matrix[totalKey]) {
                            const totalVal = this.matrix[totalKey][type];
                            if (totalVal !== null && totalVal !== undefined) {
                                return totalVal === Infinity ? 'Infinity' : totalVal;
                            }
                        }
                    }
                }
                // 处理系统变量
                if (key.startsWith('SYS_')) {
                    if (key.startsWith('SYS_TOTAL_')) {
                        const sub = key.replace('SYS_TOTAL_', '');
                        // 优先检查matrix中是否有存储的值（总计单元格可能被用户编辑过）
                        if (this.matrix && this.matrix[key]) {
                            const val = this.matrix[key][type];
                            if (val === null || val === undefined) {
                                // 如果没有存储的值，使用计算的合计值
                                return statsForRule.grandTotal[sub] ? statsForRule.grandTotal[sub][type] : (type === 'min' ? 0 : 'Infinity');
                            }
                            return val === Infinity ? 'Infinity' : val;
                        }
                        // 如果没有存储的值，使用计算的合计值
                        return statsForRule.grandTotal[sub] ? statsForRule.grandTotal[sub][type] : (type === 'min' ? 0 : 'Infinity');
                    }
                    if (key.startsWith('SYS_ROW_')) {
                        const parts = key.split('_');
                        const locPart = parts[2];
                        const skillId = parts.slice(3).join('_');
                        const row = statsForRule.rowStats[skillId];
                        return row ? (row[locPart] ? row[locPart][type] : (type === 'min' ? 0 : 'Infinity')) : (type === 'min' ? 0 : 'Infinity');
                    }
                    if (key.startsWith('SYS_COL_')) {
                        // 优先检查matrix中是否有存储的值（合计单元格可能被用户编辑过）
                        if (this.matrix && this.matrix[key]) {
                            const val = this.matrix[key][type];
                            if (val === null || val === undefined) {
                                // 如果没有存储的值，从统计中计算
                                const suffix = key.replace('SYS_COL_', '');
                                const statVal = statsForRule.colStats[suffix] ? statsForRule.colStats[suffix][type] : (type === 'min' ? 0 : Infinity);
                                return statVal === Infinity ? 'Infinity' : statVal;
                            }
                            return val === Infinity ? 'Infinity' : val;
                        }
                        // 如果没有存储的值，从统计中计算
                        const suffix = key.replace('SYS_COL_', '');
                        const statVal = statsForRule.colStats[suffix] ? statsForRule.colStats[suffix][type] : (type === 'min' ? 0 : Infinity);
                        return statVal === Infinity ? 'Infinity' : statVal;
                    }
                }
                // 处理自定义变量（递归）
                if (key.startsWith('CUST_')) {
                    const cv = this.customVars.find(c => c.id === key);
                    if (cv) {
                        const res = this.evaluateLogicRange(cv.logicRaw);
                        const val = res[type];
                        // 正确处理 Infinity：转换为字符串 'Infinity'，以便后续替换
                        return (val === Infinity || val === -Infinity) ? 'Infinity' : val;
                    }
                }
                // 默认值：最小值0，最大值Infinity（无约束）
                return type === 'min' ? 0 : 'Infinity';
            });
            let logicMin = resolveFull('min').replace(/([^><!])=([^=])/g, '$1==$2').replace(/AND/gi, '&&').replace(/OR/gi, '||');
            let logicMax = resolveFull('max').replace(/([^><!])=([^=])/g, '$1==$2').replace(/AND/gi, '&&').replace(/OR/gi, '||');
            // 将字符串 'Infinity' 和 ∞ 符号替换为数字 Infinity，避免字符串比较问题和语法错误
            logicMin = logicMin.replace(/'Infinity'/g, 'Infinity').replace(/∞/g, 'Infinity');
            logicMax = logicMax.replace(/'Infinity'/g, 'Infinity').replace(/∞/g, 'Infinity');
            let passMin = false, passMax = false;
            try { passMin = new Function(`return ${logicMin}`)(); passMax = new Function(`return ${logicMax}`)(); } catch(e) {}
            
            const vars = this.extractVariables(rule.logicRaw);
            const group = this.groups.find(g => g.id === rule.groupId);
            // 如果规则本身存在逻辑矛盾（min > max），则标记为不通过
            const finalIsPass = hasLogicError ? false : (passMin && passMax);
            
            // 调试信息：输出规则计算详情
            if (rule.name && rule.name.includes('合计')) {
                console.group(`🔍 规则计算调试: ${rule.name} (${rule.id})`);
                console.log('规则表达式:', rule.logicRaw);
                console.log('解析的规则约束:', { ruleMin, ruleMax });
                console.log('计算的表达式范围:', { min, max });
                console.log('提取的变量:', vars);
                console.log('逻辑表达式 (min):', logicMin, '→ 结果:', passMin);
                console.log('逻辑表达式 (max):', logicMax, '→ 结果:', passMax);
                console.log('最终状态:', finalIsPass ? '✅ 通过' : '❌ 不通过');
                console.log('变量值详情:');
                vars.forEach(v => {
                    if (this.matrix && this.matrix[v]) {
                        console.log(`  ${v}:`, this.matrix[v]);
                    } else {
                        console.log(`  ${v}: 未找到`);
                    }
                });
                console.groupEnd();
            }
            
            return { ...rule, currentMin: min, currentMax: max, isPass: finalIsPass, hasLogicError, vars, priority: group ? group.priority : 999 };
        });

        const finalRuleStatus = {};
        const cellStatus = {};
        const sortedRules = [...ruleResults].sort((a, b) => a.priority - b.priority);

        sortedRules.forEach(r => { finalRuleStatus[r.id] = r.isPass ? 'green' : 'red'; });

        sortedRules.forEach(r => {
            if (finalRuleStatus[r.id] === 'red') {
                r.vars.forEach(v => {
                    if (!v.startsWith('SYS_') && !v.startsWith('CUST_')) cellStatus[v] = 'yellow';
                    const parentRules = sortedRules.filter(pr => pr.priority < r.priority && pr.vars.includes(v));
                    parentRules.forEach(pr => { if (finalRuleStatus[pr.id] !== 'red') finalRuleStatus[pr.id] = 'yellow'; });
                });
            }
        });

        const groupStatus = {};
        this.groups.forEach(g => {
            const gRules = sortedRules.filter(r => r.groupId === g.id);
            if (gRules.some(r => finalRuleStatus[r.id] === 'red')) {
                groupStatus[g.id] = { status: 'invalid', text: '❌ 不生效 (存在阻断)' };
            } else if (gRules.some(r => finalRuleStatus[r.id] === 'yellow')) {
                groupStatus[g.id] = { status: 'warning', text: '⚠️ 生效 (需关注)' };
            } else {
                groupStatus[g.id] = { status: 'valid', text: '✅ 生效' };
            }
        });

        const mappedRules = sortedRules.map(r => {
            let conflictType = null;
            let relatedIds = [];
            if (finalRuleStatus[r.id] === 'red') {
                conflictType = 'violation';
                relatedIds = r.vars.filter(v => !v.startsWith('SYS_') && !v.startsWith('CUST_')).slice(0, 8); 
            } else if (finalRuleStatus[r.id] === 'yellow') {
                conflictType = 'caused-violation';
                const childViolations = sortedRules.filter(cr => cr.priority > r.priority && finalRuleStatus[cr.id] === 'red' && cr.vars.some(v => r.vars.includes(v)));
                relatedIds = childViolations.map(cr => cr.id);
            }
            return { ...r, finalStatus: finalRuleStatus[r.id], conflictType, relatedIds };
        });

        return { processedRules: mappedRules, cellConflictStatus: cellStatus, groupStatus };
    },

    /**
     * 从旧格式配置转换为矩阵格式
     */
    convertToMatrix(baseFunctions, businessFunctions) {
        const matrix = this.generateInitialMatrix();
        
        // 转换基础职能（如果值为0，max应该为null表示无约束）
        if (baseFunctions) {
            this.timeSlots.forEach(slot => {
                this.baseFunctionCodes.forEach(func => {
                    const value = baseFunctions[slot]?.[func] || { min: 0, max: null };
                    // 如果max为0，转换为null（表示无约束）
                    const convertedValue = {
                        min: value.min !== null && value.min !== undefined ? value.min : 0,
                        max: (value.max === 0 || value.max === null || value.max === undefined) ? null : value.max
                    };
                    this.LOCATIONS.forEach(loc => {
                        const key = `${slot}_${loc.id}_${func}`;
                        if (matrix[key]) {
                            matrix[key] = convertedValue;
                        }
                    });
                });
            });
        }
        
        // 转换业务职能（如果值为0，max应该为null表示无约束）
        if (businessFunctions) {
            this.timeSlots.forEach(slot => {
                this.businessFunctionCodes.forEach(func => {
                    const value = businessFunctions[slot]?.[func] || { min: 0, max: null };
                    // 如果max为0，转换为null（表示无约束）
                    const convertedValue = {
                        min: value.min !== null && value.min !== undefined ? value.min : 0,
                        max: (value.max === 0 || value.max === null || value.max === undefined) ? null : value.max
                    };
                    this.LOCATIONS.forEach(loc => {
                        const key = `${slot}_${loc.id}_${func}`;
                        if (matrix[key]) {
                            matrix[key] = convertedValue;
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
     * 显示全量人力配置矩阵（包含所有技能）
     */
    async showBaseFunctionsConfig() {
        this.currentView = 'baseFunctions';
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }
        
        // 如果没有当前配置ID，尝试从Store中获取激活的配置ID
        if (!this.currentConfigId && typeof Store !== 'undefined') {
            const activeConfigId = Store.getState('activeDailyManpowerConfigId');
            if (activeConfigId) {
                this.currentConfigId = activeConfigId;
            }
        }
        
        // 加载当前配置
        let config = await this.loadCurrentConfig();
        if (config) {
            // 如果配置存在，转换为矩阵格式
            if (config.baseFunctions || config.businessFunctions) {
                this.matrix = this.convertToMatrix(config.baseFunctions, config.businessFunctions);
            } else if (config.matrix) {
                // 如果已有矩阵数据，直接使用
                this.matrix = config.matrix;
            } else {
                this.matrix = this.generateInitialMatrix();
            }
            // 加载规则和变量
            if (config.rules) this.rules = config.rules;
            if (config.customVars) this.customVars = config.customVars;
            if (config.groups) this.groups = config.groups;
            // 如果配置中有矩阵数据，优先使用
            if (config.matrix) {
                this.matrix = config.matrix;
            }
        } else {
            this.matrix = this.generateInitialMatrix();
        }
        this.ensureRuleState(config);
        
        // 确保默认约束被应用（补充缺失的约束，不覆盖用户已修改的值）
        this.ensureDefaultConstraints();
        
        // 显示所有技能（包括星、综、收）
        const allSkills = this.SKILLS;
        // 显示所有角色（包括大夜），大夜班必须放在最末尾
        // 明确分离：先获取所有非大夜班的角色，然后将大夜班追加到最后
        const otherRoles = this.ROLES.filter(r => r !== '大夜');
        const roles = [...otherRoles, '大夜'];
        
        // 计算统计数据
        const stats = this.calculateStats();
        const { processedRules, cellConflictStatus, groupStatus } = this.computeRuleStatus();
        
        const html = `
            <div class="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col relative">
                <header class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
                    <div class="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="bg-indigo-600 text-white p-2 rounded-lg shadow-sm">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div>
                                <h1 class="text-lg font-bold text-slate-800 leading-tight">全量人力配置矩阵 Pro</h1>
                                <p class="text-xs text-slate-500">优先级级联检查 • 贝塞尔冲突连线</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <button onclick="DailyManpowerManager.toggleCustomVarMode()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${this.isCustomVarMode ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-orange-600 border border-orange-200 hover:bg-orange-50'}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                                </svg>
                                ${this.isCustomVarMode ? '完成配置' : '变量管理'}
                            </button>
                            <button onclick="DailyManpowerManager.toggleRuleMode()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${this.isRuleMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                                </svg>
                                ${this.isRuleMode ? '关闭编辑' : '新建规则'}
                            </button>
                            <div class="h-6 w-px bg-slate-200"></div>
                            <button onclick="DailyManpowerManager.clearMatrix()" 
                                    class="text-slate-400 hover:text-red-500 transition-colors">
                                <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
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

                <main class="flex-1 overflow-auto p-6 relative transition-all duration-300 ${this.isRuleMode || this.isCustomVarMode ? 'mr-80 pb-96' : 'pb-20'}" id="tableContainer">
                    <div class="max-w-[1600px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                        <div class="overflow-x-auto max-h-[65vh]">
                            <table class="w-full border-collapse text-sm table-fixed relative">
                                <thead class="sticky top-0 z-30 shadow-md">
                                    <tr>
                                        <th class="w-32 sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-3 text-left font-bold text-slate-700 shadow-[1px_0_0_rgba(0,0,0,0.05)]">职能 \\ 班次</th>
                                        ${otherRoles.map(role => `
                                            <th key="${role}" colSpan="3" class="border-b border-r border-slate-200 p-2 text-slate-800 font-bold text-center sticky top-0 bg-slate-100">${role}</th>
                                `).join('')}
                                        <th class="bg-blue-50 border-b border-slate-200 p-2 w-24 font-bold text-blue-800 text-center sticky top-0 z-20">沪合计</th>
                                        <th class="bg-emerald-50 border-b border-slate-200 p-2 w-24 font-bold text-emerald-800 text-center sticky top-0 z-20">蓉合计</th>
                                        <th class="bg-purple-50 border-b border-slate-200 p-2 w-24 font-bold text-purple-800 text-center sticky top-0 z-20">总合计</th>
                                        <th key="大夜" colSpan="3" class="border-b border-r border-slate-200 p-2 text-slate-800 font-bold text-center sticky top-0 bg-indigo-50 text-indigo-900">大夜</th>
                            </tr>
                            <tr>
                                        <th class="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-2 text-xs text-slate-400 font-normal text-left shadow-[1px_0_0_rgba(0,0,0,0.05)]">编辑区域</th>
                                        ${otherRoles.map(role => `
                                            ${this.LOCATIONS.map(loc => `
                                                <th key="${role}_${loc.id}" class="border-b border-r border-slate-100 p-1.5 text-xs font-bold text-center w-20 ${loc.bg} ${loc.color}">${loc.name}</th>
                                `).join('')}
                                            <th key="${role}_TOTAL" class="border-b border-r border-slate-100 p-1.5 text-xs font-bold text-center w-20 bg-purple-50 text-purple-700">合计</th>
                                        `).join('')}
                                        <th class="bg-blue-50 border-b border-slate-200 p-1 text-[10px] text-blue-400 text-center">范围</th>
                                        <th class="bg-emerald-50 border-b border-slate-200 p-1 text-[10px] text-emerald-400 text-center">范围</th>
                                        <th class="bg-purple-50 border-b border-slate-200 p-1 text-[10px] text-purple-400 text-center">范围</th>
                                        ${this.LOCATIONS.map(loc => `
                                            <th key="大夜_${loc.id}" class="border-b border-r border-slate-100 p-1.5 text-xs font-bold text-center w-20 ${loc.bg} ${loc.color}">${loc.name}</th>
                                `).join('')}
                                        <th key="大夜_TOTAL" class="border-b border-r border-slate-100 p-1.5 text-xs font-bold text-center w-20 bg-purple-50 text-purple-700">合计</th>
                            </tr>
                        </thead>
                                <tbody>
                                    ${allSkills.map((skill, index) => `
                                        <tr key="${skill.id}" class="group">
                                            <td class="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 p-3 font-medium text-slate-700 flex items-center justify-between shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full ${skill.category === 'biz' ? 'bg-blue-500' : 'bg-slate-300'}"></span>${skill.name}
                                                </div>
                                            </td>
                                            ${otherRoles.map(role => {
                                                // 其他角色正常显示
                                                // 生成沪、蓉单元格
                                                const locationCells = this.LOCATIONS.map(loc => {
                                                    const key = `${role}_${loc.id}_${skill.id}`;
                                                    const cell = this.matrix[key] || {min: null, max: null};
                                                    const isConflict = cellConflictStatus[key] === 'yellow';
                                                    const cellStatus = this.getCellDefinitionStatus(key);
                                                    const cellStyleClass = this.getCellStyleClass(key, isConflict);
                                                    // 如果值为空，显示为 0/∞
                                                    const minStr = cell.min !== null && cell.min !== undefined ? cell.min : '0';
                                                    const maxStr = cell.max !== null && cell.max !== undefined ? cell.max : '∞';
                                                    // 已定义的单元格显示定义标记
                                                    const definedMarker = cellStatus.isDefined ? '<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500"></span>' : '';
                                                    return `
                                                        <td key="${key}" 
                                                            data-key="${key}"
                                                            data-priority="${cellStatus.priority}"
                                                            data-defined="${cellStatus.isDefined}"
                                                            onclick="DailyManpowerManager.handleAnyCellClick('${key}', '${loc.name}_${role}_${skill.name}', event)" 
                                                            class="cursor-pointer border-b border-r border-slate-100 p-0 relative transition-colors ${cellStyleClass}"
                                                        >
                                                            ${definedMarker}
                                                            <div class="h-10 w-full flex items-center justify-center text-xs font-mono">
                                                                <span class="${loc.color}">${minStr}/${maxStr}</span>
                                                            </div>
                                                        </td>
                                                    `;
                                                }).join('');
                                                
                                                // 合计单元格：优先使用matrix中存储的值，如果为空则自动计算左侧单元格的加总
                                                const totalKey = `SYS_COL_${role}_ALL_${skill.id}`;
                                                const totalCell = this.matrix[totalKey] || {min: null, max: null};
                                                
                                                // 如果matrix中有值且不是默认值，使用matrix中的值
                                                // 判断是否有固定值：min 或 max 至少有一个不是 null/undefined，且不是默认的 0/null 组合
                                                let totalMin, totalMax;
                                                const hasFixedValue = (totalCell.min !== null && totalCell.min !== undefined) || 
                                                                      (totalCell.max !== null && totalCell.max !== undefined);
                                                const isDefaultValue = (totalCell.min === null || totalCell.min === undefined || totalCell.min === 0) && 
                                                                       (totalCell.max === null || totalCell.max === undefined);
                                                
                                                if (hasFixedValue && !isDefaultValue) {
                                                    // 使用matrix中存储的值
                                                    totalMin = totalCell.min !== null && totalCell.min !== undefined ? totalCell.min : 0;
                                                    totalMax = totalCell.max !== null && totalCell.max !== undefined ? totalCell.max : Infinity;
                                                } else {
                                                    // 自动计算左侧两个地点单元格的加总
                                                    let sumMin = 0;
                                                    let sumMax = 0;
                                                    let hasInfinity = false;
                                                    this.LOCATIONS.forEach(loc => {
                                                        const baseKey = `${role}_${loc.id}_${skill.id}`;
                                                        const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                        const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                        const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                        sumMin += baseMin;
                                                        // 最大值计算：累加所有基础单元格的最大值
                                                        // 如果任何基础单元格的最大值是 Infinity，则结果为 Infinity
                                                        // 否则是所有基础单元格最大值的和
                                                        if (baseMax === Infinity) {
                                                            hasInfinity = true;
                                                        }
                                                        // 无论是否有 Infinity，都累加最大值（用于计算总和）
                                                        if (baseMax !== Infinity) {
                                                            sumMax += baseMax;
                                                        }
                                                    });
                                                    totalMin = sumMin;
                                                    totalMax = hasInfinity ? Infinity : sumMax;
                                                }
                                                
                                                const totalMinStr = totalMin !== null && totalMin !== undefined && totalMin !== Infinity ? totalMin : (totalMin === Infinity ? '∞' : '0');
                                                const totalMaxStr = totalMax === Infinity || totalMax === null || totalMax === undefined ? '∞' : totalMax;
                                                
                                                // 返回沪、蓉、合计三列
                                                return locationCells + `
                                                    <td key="${totalKey}" 
                                                        data-key="${totalKey}"
                                                        onclick="DailyManpowerManager.handleAnyCellClick('${totalKey}', '合计_${role}_${skill.name}', event)" 
                                                        class="cursor-pointer border-b border-r border-slate-100 p-0 relative transition-colors bg-purple-50/50 hover:bg-purple-100"
                                                    >
                                                        <div class="h-10 w-full flex items-center justify-center text-xs font-mono">
                                                            <span class="text-purple-700">${totalMinStr}/${totalMaxStr}</span>
                                                        </div>
                                                    </td>
                                                `;
                                            }).join('')}
                                            ${[
                                                { id: 'SH', title: `沪_${skill.name}`, bg: 'bg-blue-50/30' },
                                                { id: 'CD', title: `蓉_${skill.name}`, bg: 'bg-emerald-50/30' },
                                                { id: 'ALL', title: `总_${skill.name}`, bg: 'bg-purple-50/30' },
                                            ].map(col => {
                                                const sysKey = `SYS_ROW_${col.id}_${skill.id}`;
                                                const cell = this.matrix[sysKey] || {min: null, max: null};
                                                
                                                // 如果matrix中有值且不是默认值，使用matrix中的值
                                                // 判断是否有固定值：min 或 max 至少有一个不是 null/undefined，且不是默认的 0/null 组合
                                                let rowMin, rowMax;
                                                const hasFixedValue = (cell.min !== null && cell.min !== undefined) || 
                                                                      (cell.max !== null && cell.max !== undefined);
                                                const isDefaultValue = (cell.min === null || cell.min === undefined || cell.min === 0) && 
                                                                       (cell.max === null || cell.max === undefined);
                                                
                                                if (hasFixedValue && !isDefaultValue) {
                                                    // 使用matrix中存储的值
                                                    rowMin = cell.min !== null && cell.min !== undefined ? cell.min : 0;
                                                    rowMax = cell.max !== null && cell.max !== undefined ? cell.max : Infinity;
                                                } else {
                                                    // 自动计算该技能在该地点（或所有地点）的所有角色的合计
                                                    let sumMin = 0;
                                                    let sumMax = 0;
                                                    let hasInfinity = false;
                                                    const roles = this.ROLES.filter(r => r !== '大夜'); // 不包括大夜班
                                                    
                                                    if (col.id === 'ALL') {
                                                        // 所有地点的合计
                                                        roles.forEach(role => {
                                                            this.LOCATIONS.forEach(loc => {
                                                                const baseKey = `${role}_${loc.id}_${skill.id}`;
                                                                const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                                const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                                const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                                sumMin += baseMin;
                                                                // 最大值计算：累加所有基础单元格的最大值
                                                                // 如果任何基础单元格的最大值是 Infinity，则结果为 Infinity
                                                                // 否则是所有基础单元格最大值的和
                                                                if (baseMax === Infinity) {
                                                                    hasInfinity = true;
                                                                }
                                                                // 无论是否有 Infinity，都累加最大值（用于计算总和）
                                                                if (baseMax !== Infinity) {
                                                                    sumMax += baseMax;
                                                                }
                                                            });
                                                        });
                                                    } else {
                                                        // 特定地点的合计
                                                        const loc = this.LOCATIONS.find(l => l.id === col.id);
                                                        if (loc) {
                                                            roles.forEach(role => {
                                                                const baseKey = `${role}_${loc.id}_${skill.id}`;
                                                                const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                                const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                                const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                                sumMin += baseMin;
                                                                // 最大值计算：累加所有基础单元格的最大值
                                                                // 如果任何基础单元格的最大值是 Infinity，则结果为 Infinity
                                                                // 否则是所有基础单元格最大值的和
                                                                if (baseMax === Infinity) {
                                                                    hasInfinity = true;
                                                                }
                                                                // 无论是否有 Infinity，都累加最大值（用于计算总和）
                                                                if (baseMax !== Infinity) {
                                                                    sumMax += baseMax;
                                                                }
                                                            });
                                                        }
                                                    }
                                                    rowMin = sumMin;
                                                    rowMax = hasInfinity ? Infinity : sumMax;
                                                }
                                                
                                                const minStr = rowMin !== null && rowMin !== undefined && rowMin !== Infinity ? rowMin : (rowMin === Infinity ? '∞' : '0');
                                                const maxStr = rowMax === Infinity || rowMax === null || rowMax === undefined ? '∞' : rowMax;
                                                return `
                                                    <td key="${col.id}" 
                                                        data-stat="${skill.id}_${col.id}"
                                                        data-key="${sysKey}"
                                                        onclick="DailyManpowerManager.handleAnyCellClick('${sysKey}', '${col.title}', event)" 
                                                        class="border-b border-slate-200 p-0 text-center transition-colors ${col.bg} hover:bg-amber-100 cursor-pointer"
                                                    >
                                                        <div class="h-10 w-full flex items-center justify-center text-xs font-mono">
                                                            <span class="${col.id === 'SH' ? 'text-blue-700' : col.id === 'CD' ? 'text-emerald-700' : 'text-purple-700'}">${minStr}/${maxStr}</span>
                                                        </div>
                                                    </td>
                                                `;
                                            }).join('')}
                                            ${(() => {
                                                // 大夜班特殊处理：只在第一行显示，使用rowSpan，并且必须放在总合计列之后
                                                if (index === 0) {
                                                    // 第一行：显示大夜班单元格（沪、蓉、合计），使用rowSpan
                                                    const locationCells = this.LOCATIONS.map(loc => {
                                                        const key = `大夜_${loc.id}_common`;
                                                        const cell = this.matrix[key] || {min: null, max: null};
                                                        const isConflict = cellConflictStatus[key] === 'yellow';
                                                        const minStr = cell.min !== null && cell.min !== undefined ? cell.min : '0';
                                                        const maxStr = cell.max !== null && cell.max !== undefined ? cell.max : '∞';
                                                        return `
                                                            <td key="${key}" 
                                                                rowspan="${allSkills.length}"
                                                                data-key="${key}"
                                                                onclick="DailyManpowerManager.handleAnyCellClick('${key}', '${loc.name}_大夜_通岗', event)" 
                                                                class="cursor-pointer border-b border-r border-slate-100 p-0 relative align-middle transition-colors ${isConflict ? 'bg-amber-100 border-amber-300 ring-1 ring-inset ring-amber-400' : 'bg-indigo-50/50 hover:bg-indigo-100'}"
                                                            >
                                                                <div class="flex flex-col items-center justify-center" style="min-height: ${allSkills.length * 40}px;">
                                                                    <span class="text-sm font-mono font-bold ${loc.color}">${minStr}/${maxStr}</span>
                                                                </div>
                                                            </td>
                                                        `;
                                                    }).join('');
                                                    
                                                    // 大夜班合计：优先使用matrix中存储的值，如果为空则自动计算
                                                    const totalKey = `SYS_COL_大夜_ALL`;
                                                    const totalCell = this.matrix[totalKey] || {min: null, max: null};
                                                    
                                                    // 判断是否有固定值
                                                    const hasFixedValue = (totalCell.min !== null && totalCell.min !== undefined) || 
                                                                          (totalCell.max !== null && totalCell.max !== undefined);
                                                    const isDefaultValue = (totalCell.min === null || totalCell.min === undefined || totalCell.min === 0) && 
                                                                           (totalCell.max === null || totalCell.max === undefined);
                                                    
                                                    let totalMinStr, totalMaxStr;
                                                    if (hasFixedValue && !isDefaultValue) {
                                                        // 使用matrix中存储的值
                                                        totalMinStr = totalCell.min !== null && totalCell.min !== undefined ? totalCell.min : '0';
                                                        totalMaxStr = totalCell.max !== null && totalCell.max !== undefined ? totalCell.max : '∞';
                                                    } else {
                                                        // 自动计算：大夜_上海 + 大夜_成都
                                                        let sumMin = 0;
                                                        let sumMax = 0;
                                                        let hasInfinity = false;
                                                        this.LOCATIONS.forEach(loc => {
                                                            const baseKey = `大夜_${loc.id}_common`;
                                                            const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                            const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                            const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                            sumMin += baseMin;
                                                            // 最大值计算：累加所有基础单元格的最大值
                                                            // 如果任何基础单元格的最大值是 Infinity，则结果为 Infinity
                                                            // 否则是所有基础单元格最大值的和
                                                            if (baseMax === Infinity) {
                                                                hasInfinity = true;
                                                            }
                                                            // 无论是否有 Infinity，都累加最大值（用于计算总和）
                                                            if (baseMax !== Infinity) {
                                                                sumMax += baseMax;
                                                            }
                                                        });
                                                        totalMinStr = sumMin;
                                                        totalMaxStr = hasInfinity ? '∞' : sumMax;
                                                    }
                                                    
                                                    // 返回沪、蓉、合计三列（大夜班必须放在总合计列之后）
                                                    return locationCells + `
                                                        <td key="${totalKey}" 
                                                            rowspan="${allSkills.length}"
                                                            data-key="${totalKey}"
                                                            onclick="DailyManpowerManager.handleAnyCellClick('${totalKey}', '合计_大夜', event)" 
                                                            class="cursor-pointer border-b border-r border-slate-100 p-0 relative align-middle transition-colors bg-purple-50/50 hover:bg-purple-100"
                                                        >
                                                            <div class="flex flex-col items-center justify-center" style="min-height: ${allSkills.length * 40}px;">
                                                                <span class="text-sm font-mono font-bold text-purple-700">${totalMinStr}/${totalMaxStr}</span>
                                                            </div>
                                                        </td>
                                                    `;
                                                } else {
                                                    // 其他行：不显示大夜班单元格（因为使用了rowSpan）
                                                    return '';
                                                }
                                            })()}
                                    </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot class="sticky bottom-0 z-30">
                                    <tr class="bg-slate-100 border-t-2 border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                                        <td class="sticky left-0 z-30 bg-slate-100 border-r border-slate-200 p-3 font-bold text-slate-800 text-right shadow-[1px_0_0_rgba(0,0,0,0.05)]">纵向合计</td>
                                        ${otherRoles.map(role => {
                                            // 生成沪、蓉合计单元格：优先使用matrix中存储的值，如果为空则自动计算该角色在该地点的所有技能的合计
                                            const locationCells = this.LOCATIONS.map(loc => {
                                                const sysKey = `SYS_COL_${role}_${loc.id}`;
                                                const cell = this.matrix[sysKey] || {min: null, max: null};
                                                
                                                // 如果matrix中有值且不是默认值，使用matrix中的值
                                                // 判断是否有固定值：min 或 max 至少有一个不是 null/undefined，且不是默认的 0/null 组合
                                                let locMin, locMax;
                                                const hasFixedValue = (cell.min !== null && cell.min !== undefined) || 
                                                                      (cell.max !== null && cell.max !== undefined);
                                                const isDefaultValue = (cell.min === null || cell.min === undefined || cell.min === 0) && 
                                                                       (cell.max === null || cell.max === undefined);
                                                
                                                if (hasFixedValue && !isDefaultValue) {
                                                    // 使用matrix中存储的值
                                                    locMin = cell.min !== null && cell.min !== undefined ? cell.min : 0;
                                                    locMax = cell.max !== null && cell.max !== undefined ? cell.max : Infinity;
                                                } else {
                                                    // 自动计算该角色在该地点的所有技能的合计
                                                    let sumMin = 0;
                                                    let sumMax = 0;
                                                    let hasInfinity = false;
                                                    // 其他角色：计算所有技能的合计
                                                    this.SKILLS.forEach(skill => {
                                                        const baseKey = `${role}_${loc.id}_${skill.id}`;
                                                        const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                        const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                        const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                        sumMin += baseMin;
                                                        // 最大值计算：如果任何基础单元格的最大值是 Infinity，则结果为 Infinity
                                                        // 否则累加所有基础单元格的最大值
                                                        if (baseMax === Infinity) {
                                                            hasInfinity = true;
                                                        }
                                                        // 无论是否有 Infinity，都累加最大值（用于计算总和）
                                                        if (baseMax !== Infinity) {
                                                            sumMax += baseMax;
                                                        }
                                                    });
                                                    locMin = sumMin;
                                                    locMax = hasInfinity ? Infinity : sumMax;
                                                }
                                                
                                                const minStr = locMin !== null && locMin !== undefined && locMin !== Infinity ? locMin : (locMin === Infinity ? '∞' : '0');
                                                const maxStr = locMax === Infinity || locMax === null || locMax === undefined ? '∞' : locMax;
                                                return `
                                                    <td key="total_${role}_${loc.id}" 
                                                        data-key="${sysKey}"
                                                        onclick="DailyManpowerManager.handleAnyCellClick('${sysKey}', '合计_${loc.name}_${role}', event)" 
                                                        class="p-2 border-r border-slate-200 text-center transition-colors cursor-pointer ${role === '大夜' ? 'bg-indigo-50 hover:bg-indigo-100' : 'bg-purple-50 hover:bg-amber-100'}"
                                                    >
                                                        <div class="flex flex-col items-center">
                                                            <span class="text-[10px] font-bold ${role === '大夜' ? 'text-indigo-700' : 'text-slate-500'} mb-0.5">${role} ${loc.name}</span>
                                                            <span class="text-xs font-mono font-bold ${role === '大夜' ? 'text-indigo-700' : 'text-slate-700'}">${minStr}/${maxStr}</span>
                                                        </div>
                                                    </td>
                                                `;
                                            }).join('');
                                            
                                            // 纵向合计的总计：优先使用matrix中存储的值，如果为空则自动计算该角色在所有地点的所有技能的合计
                                            const totalAllKey = `SYS_COL_${role}_ALL`;
                                            const totalAllCell = this.matrix[totalAllKey] || {min: null, max: null};
                                            
                                            // 如果matrix中有值且不是默认值，使用matrix中的值
                                            // 判断是否有固定值：min 或 max 至少有一个不是 null/undefined，且不是默认的 0/null 组合
                                            let totalAllMin, totalAllMax;
                                            const hasFixedValue = (totalAllCell.min !== null && totalAllCell.min !== undefined) || 
                                                                  (totalAllCell.max !== null && totalAllCell.max !== undefined);
                                            const isDefaultValue = (totalAllCell.min === null || totalAllCell.min === undefined || totalAllCell.min === 0) && 
                                                                   (totalAllCell.max === null || totalAllCell.max === undefined);
                                            
                                                if (hasFixedValue && !isDefaultValue) {
                                                    // 使用matrix中存储的值
                                                    totalAllMin = totalAllCell.min !== null && totalAllCell.min !== undefined ? totalAllCell.min : 0;
                                                    totalAllMax = totalAllCell.max !== null && totalAllCell.max !== undefined ? totalAllCell.max : Infinity;
                                                } else {
                                                    // 自动计算该角色在所有地点的所有技能的合计
                                                    let sumMin = 0;
                                                    let sumMax = 0;
                                                    let hasInfinity = false;
                                                    // 其他角色：计算所有技能在所有地点的合计
                                                    this.SKILLS.forEach(skill => {
                                                        this.LOCATIONS.forEach(loc => {
                                                            const baseKey = `${role}_${loc.id}_${skill.id}`;
                                                            const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                            const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                            const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                            sumMin += baseMin;
                                                            // 最大值计算：如果任何基础单元格的最大值是 Infinity，则结果为 Infinity
                                                            // 否则累加所有基础单元格的最大值
                                                            if (baseMax === Infinity) {
                                                                hasInfinity = true;
                                                            }
                                                            // 无论是否有 Infinity，都累加最大值（用于计算总和）
                                                            if (baseMax !== Infinity) {
                                                                sumMax += baseMax;
                                                            }
                                                        });
                                                    });
                                                    totalAllMin = sumMin;
                                                    totalAllMax = hasInfinity ? Infinity : sumMax;
                                                }
                                            
                                            const totalAllMinStr = totalAllMin !== null && totalAllMin !== undefined && totalAllMin !== Infinity ? totalAllMin : (totalAllMin === Infinity ? '∞' : '0');
                                            const totalAllMaxStr = totalAllMax === Infinity || totalAllMax === null || totalAllMax === undefined ? '∞' : totalAllMax;
                                            
                                            // 返回沪、蓉、合计三列
                                            return locationCells + `
                                                <td key="total_${role}_ALL" 
                                                    data-key="${totalAllKey}"
                                                    onclick="DailyManpowerManager.handleAnyCellClick('${totalAllKey}', '合计_${role}', event)" 
                                                    class="p-2 border-r border-slate-200 text-center transition-colors cursor-pointer bg-purple-100 hover:bg-amber-100"
                                                >
                                                    <div class="flex flex-col items-center">
                                                        <span class="text-[10px] font-bold text-purple-700 mb-0.5">${role}</span>
                                                        <span class="text-xs font-mono font-bold text-purple-700">${totalAllMinStr}/${totalAllMaxStr}</span>
                                                    </div>
                                                </td>
                                            `;
                                        }).join('')}
                                        ${[
                                            { id: 'SH', title: '沪总', bg: 'bg-blue-100 text-blue-900' },
                                            { id: 'CD', title: '蓉总', bg: 'bg-emerald-100 text-emerald-900' },
                                            { id: 'ALL', title: '全天', bg: 'bg-indigo-600 text-white' },
                                        ].map(col => {
                                            const sysKey = `SYS_TOTAL_${col.id}`;
                                            // 优先使用matrix中存储的值，如果没有则使用计算的合计值
                                            const cell = this.matrix[sysKey];
                                            let displayData;
                                            if (cell && (cell.min !== null && cell.min !== undefined || cell.max !== null && cell.max !== undefined)) {
                                                // 使用存储的值
                                                displayData = {
                                                    min: cell.min !== null && cell.min !== undefined ? cell.min : 0,
                                                    max: cell.max !== null && cell.max !== undefined ? (cell.max === Infinity ? '∞' : cell.max) : '∞'
                                                };
                                            } else {
                                                // 使用计算的合计值
                                                const calculatedData = stats.grandTotal[col.id] || {min:0, max:0};
                                                displayData = {
                                                    min: calculatedData.min || 0,
                                                    max: calculatedData.max === Infinity ? '∞' : (calculatedData.max || '∞')
                                                };
                                            }
                                            return `
                                                <td key="${col.id}" 
                                                    data-key="${sysKey}"
                                                    onclick="DailyManpowerManager.handleAnyCellClick('${sysKey}', '${col.title}', event)" 
                                                    class="p-2 text-center font-bold ${col.bg} transition-all shadow-inner cursor-pointer hover:ring-2 ring-amber-300"
                                                >
                                                    <div class="flex flex-col items-center justify-center">
                                                        <div class="text-[10px] opacity-75 mb-0.5">${col.title}</div>
                                                        <div class="font-mono text-xs">${displayData.min}/${displayData.max}</div>
                                                    </div>
                                                </td>
                                            `;
                                        }).join('')}
                                        ${(() => {
                                            // 大夜班合计行：必须放在总合计列之后
                                            const role = '大夜';
                                            // 生成沪、蓉合计单元格：优先使用matrix中存储的值，如果为空则自动计算该角色在该地点的所有技能的合计
                                            const locationCells = this.LOCATIONS.map(loc => {
                                                const sysKey = `SYS_COL_${role}_${loc.id}`;
                                                const cell = this.matrix[sysKey] || {min: null, max: null};
                                                
                                                // 如果matrix中有值且不是默认值，使用matrix中的值
                                                // 判断是否有固定值：min 或 max 至少有一个不是 null/undefined，且不是默认的 0/null 组合
                                                let locMin, locMax;
                                                const hasFixedValue = (cell.min !== null && cell.min !== undefined) || 
                                                                      (cell.max !== null && cell.max !== undefined);
                                                const isDefaultValue = (cell.min === null || cell.min === undefined || cell.min === 0) && 
                                                                       (cell.max === null || cell.max === undefined);
                                                
                                                if (hasFixedValue && !isDefaultValue) {
                                                    // 使用matrix中存储的值
                                                    locMin = cell.min !== null && cell.min !== undefined ? cell.min : 0;
                                                    locMax = cell.max !== null && cell.max !== undefined ? cell.max : Infinity;
                                                } else {
                                                    // 自动计算：大夜班特殊处理
                                                    const baseKey = `大夜_${loc.id}_common`;
                                                    const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                    const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                    const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                    locMin = baseMin;
                                                    locMax = baseMax;
                                                }
                                                
                                                const minStr = locMin !== null && locMin !== undefined && locMin !== Infinity ? locMin : (locMin === Infinity ? '∞' : '0');
                                                const maxStr = locMax === Infinity || locMax === null || locMax === undefined ? '∞' : locMax;
                                                return `
                                                    <td key="total_${role}_${loc.id}" 
                                                        data-key="${sysKey}"
                                                        onclick="DailyManpowerManager.handleAnyCellClick('${sysKey}', '合计_${loc.name}_${role}', event)" 
                                                        class="p-2 border-r border-slate-200 text-center transition-colors cursor-pointer bg-indigo-50 hover:bg-indigo-100"
                                                    >
                                                        <div class="flex flex-col items-center">
                                                            <span class="text-[10px] font-bold text-indigo-700 mb-0.5">${role} ${loc.name}</span>
                                                            <span class="text-xs font-mono font-bold text-indigo-700">${minStr}/${maxStr}</span>
                                                        </div>
                                                    </td>
                                                `;
                                            }).join('');
                                            
                                            // 纵向合计的总计：优先使用matrix中存储的值，如果为空则自动计算该角色在所有地点的所有技能的合计
                                            const totalAllKey = `SYS_COL_${role}_ALL`;
                                            const totalAllCell = this.matrix[totalAllKey] || {min: null, max: null};
                                            
                                            // 如果matrix中有值且不是默认值，使用matrix中的值
                                            // 判断是否有固定值：min 或 max 至少有一个不是 null/undefined，且不是默认的 0/null 组合
                                            let totalAllMin, totalAllMax;
                                            const hasFixedValue = (totalAllCell.min !== null && totalAllCell.min !== undefined) || 
                                                                  (totalAllCell.max !== null && totalAllCell.max !== undefined);
                                            const isDefaultValue = (totalAllCell.min === null || totalAllCell.min === undefined || totalAllCell.min === 0) && 
                                                                   (totalAllCell.max === null || totalAllCell.max === undefined);
                                            
                                            if (hasFixedValue && !isDefaultValue) {
                                                // 使用matrix中存储的值
                                                totalAllMin = totalAllCell.min !== null && totalAllCell.min !== undefined ? totalAllCell.min : 0;
                                                totalAllMax = totalAllCell.max !== null && totalAllCell.max !== undefined ? totalAllCell.max : Infinity;
                                            } else {
                                                // 自动计算：大夜班特殊处理
                                                let sumMin = 0;
                                                let sumMax = 0;
                                                let hasInfinity = false;
                                                this.LOCATIONS.forEach(loc => {
                                                    const baseKey = `大夜_${loc.id}_common`;
                                                    const baseCell = this.matrix[baseKey] || {min: null, max: null};
                                                    const baseMin = baseCell.min !== null && baseCell.min !== undefined ? baseCell.min : 0;
                                                    const baseMax = baseCell.max !== null && baseCell.max !== undefined ? baseCell.max : Infinity;
                                                    sumMin += baseMin;
                                                    // 最大值计算：累加所有基础单元格的最大值
                                                    // 如果任何基础单元格的最大值是 Infinity，则结果为 Infinity
                                                    // 否则是所有基础单元格最大值的和
                                                    if (baseMax === Infinity) {
                                                        hasInfinity = true;
                                                    }
                                                    // 无论是否有 Infinity，都累加最大值（用于计算总和）
                                                    if (baseMax !== Infinity) {
                                                        sumMax += baseMax;
                                                    }
                                                });
                                                totalAllMin = sumMin;
                                                totalAllMax = hasInfinity ? Infinity : sumMax;
                                            }
                                            
                                            const totalAllMinStr = totalAllMin !== null && totalAllMin !== undefined && totalAllMin !== Infinity ? totalAllMin : (totalAllMin === Infinity ? '∞' : '0');
                                            const totalAllMaxStr = totalAllMax === Infinity || totalAllMax === null || totalAllMax === undefined ? '∞' : totalAllMax;
                                            
                                            // 返回沪、蓉、合计三列（大夜班必须放在总合计列之后）
                                            return locationCells + `
                                                <td key="total_${role}_ALL" 
                                                    data-key="${totalAllKey}"
                                                    onclick="DailyManpowerManager.handleAnyCellClick('${totalAllKey}', '合计_${role}', event)" 
                                                    class="p-2 border-r border-slate-200 text-center transition-colors cursor-pointer bg-purple-100 hover:bg-amber-100"
                                                >
                                                    <div class="flex flex-col items-center">
                                                        <span class="text-[10px] font-bold text-purple-700 mb-0.5">${role}</span>
                                                        <span class="text-xs font-mono font-bold text-purple-700">${totalAllMinStr}/${totalAllMaxStr}</span>
                                                    </div>
                                                </td>
                                            `;
                                        })()}
                                    </tr>
                                </tfoot>
                    </table>
                </div>
                    </div>
                    
                    <!-- 规则展示 (分组) -->
                    <div class="max-w-[1600px] mx-auto grid grid-cols-1 gap-6">
                        ${this.groups.map(group => {
                            const groupRules = processedRules.filter(r => r.groupId === group.id);
                            const statusInfo = groupStatus[group.id];
                            
                            return `
                                <div key="${group.id}" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                        <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                            <span class="bg-indigo-100 text-indigo-700 w-6 h-6 flex items-center justify-center rounded text-xs font-mono">${group.priority}</span>
                                            ${group.name}
                                        </h3>
                                        <div class="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                                            statusInfo?.status === 'invalid' ? 'bg-red-100 text-red-700 border border-red-200' :
                                            statusInfo?.status === 'warning' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                            'bg-green-100 text-green-700 border border-green-200'
                                        }">
                                            ${statusInfo?.text || '状态未知'}
                                        </div>
                                    </div>
                                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        ${groupRules.length === 0 ? '<div class="text-slate-400 text-sm italic col-span-full py-4 text-center">暂无规则</div>' : ''}
                                        ${groupRules.map(rule => `
                                            <div 
                                                key="${rule.id}" 
                                                data-rule-id="${rule.id}"
                                                onmouseenter="DailyManpowerManager.onRuleHover('${rule.id}', '${rule.conflictType || ''}')"
                                                onmouseleave="DailyManpowerManager.onRuleLeave()"
                                                class="p-4 rounded-xl border-2 transition-all relative group shadow-sm ${
                                                    rule.finalStatus === 'red' ? 'border-red-200 bg-red-50 hover:shadow-red-100' : 
                                                    rule.finalStatus === 'yellow' ? 'border-amber-200 bg-amber-50 hover:shadow-amber-100' : 
                                                    'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-indigo-50'
                                                }"
                                            >
                                                <div class="flex justify-between items-center mb-3">
                                                    <span class="font-bold text-sm text-slate-700 line-clamp-1" title="${rule.name}">${rule.name}</span>
                                                    <div class="flex gap-1">
                                                        <button onclick="DailyManpowerManager.editRule('${rule.id}')" class="p-1 hover:bg-black/5 rounded text-slate-400 hover:text-indigo-600 transition-colors" title="修改">
                                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        </button>
                                                        <button onclick="DailyManpowerManager.renameRule('${rule.id}')" class="p-1 hover:bg-black/5 rounded text-slate-400 hover:text-blue-600 transition-colors" title="重命名">
                                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
                                                        </button>
                                                        <button onclick="DailyManpowerManager.copyRule('${rule.id}')" class="p-1 hover:bg-black/5 rounded text-slate-400 hover:text-green-600 transition-colors" title="复制">
                                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                        </button>
                                                        <button onclick="DailyManpowerManager.deleteRule('${rule.id}')" class="p-1 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded transition-colors" title="删除">
                                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div class="text-xs font-mono text-slate-600 bg-white/60 p-2 rounded break-all leading-relaxed border border-transparent border-slate-100 mb-2">
                                                    ${this.renderLogicDisplay(rule.logicRaw)}
                                                </div>
                                                <div class="text-xs font-bold flex items-center gap-2 ${
                                                    rule.finalStatus === 'red' ? 'text-red-600' : 
                                                    rule.finalStatus === 'yellow' ? 'text-amber-600' : 
                                                    'text-emerald-600'
                                                }">
                                                    <span>${rule.hasLogicError ? '逻辑矛盾' : (rule.finalStatus === 'green' ? '合规' : (rule.finalStatus === 'yellow' ? '上级规则冲突' : '规则违规'))}</span>
                                                    <span class="ml-auto font-mono text-slate-400 bg-white/80 px-2 py-0.5 rounded text-[10px]">${rule.currentMin || 0} ~ ${rule.currentMax || 0}</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </main>
            </div>
        `;
        
        scheduleTable.innerHTML = html;
        
        // 确保main元素的margin-right正确设置，避免被侧边栏遮挡
        setTimeout(() => {
            const tableContainer = document.getElementById('tableContainer');
            if (tableContainer) {
                if (this.isRuleMode || this.isCustomVarMode) {
                    tableContainer.classList.add('mr-80');
                    tableContainer.classList.add('pb-96');
                    tableContainer.classList.remove('pb-20');
                } else {
                    tableContainer.classList.remove('mr-80');
                    tableContainer.classList.remove('pb-96');
                    tableContainer.classList.add('pb-20');
                }
            }
        }, 0);
        
        // 延迟绑定元素引用和渲染（确保DOM已完全渲染）
        setTimeout(() => {
            // 绑定元素引用（包括规则卡片和单元格）
            this.bindElementRefs();
            
            // 渲染规则编辑器和变量侧边栏（如果处于编辑模式）
            if (this.isRuleMode || this.isCustomVarMode) {
                this.renderRuleEditor();
                this.renderVariableSidebar();
            }
            
            // 渲染贝塞尔连线（如果存在悬停冲突）
            if (this.activeHoverConflict) {
                this.renderBezierConnections();
            }
        }, 100);
    },
    
    /**
     * 计算统计数据
     */
    calculateStats() {
        const rowStats = {};
        const colStats = {};
        const grandTotal = { ALL: {min:0, max:0}, SH: {min:0, max:0}, CD: {min:0, max:0} };
        
        const roles = this.ROLES.filter(r => r !== '大夜');
        
        // 初始化列统计（包括大夜班）
        this.ROLES.forEach(r => {
            this.LOCATIONS.forEach(l => {
                colStats[`${r}_${l.id}`] = { min: 0, max: 0 };
            });
        });
        
        // 计算行统计（按技能，不包括大夜班）
        this.SKILLS.forEach(s => {
            let rowMin = 0, rowMax = 0, rowShMin = 0, rowShMax = 0, rowCdMin = 0, rowCdMax = 0;
            let hasInfinityMax = false, hasInfinityShMax = false, hasInfinityCdMax = false;
            roles.forEach(r => {
                this.LOCATIONS.forEach(l => {
                    const key = `${r}_${l.id}_${s.id}`;
                    const cell = this.matrix[key] || { min: null, max: null };
                    const cellMin = cell.min !== null && cell.min !== undefined ? cell.min : 0;
                    const cellMax = cell.max !== null && cell.max !== undefined ? cell.max : Infinity;
                    if (l.id === 'SH') {
                        rowShMin += cellMin;
                        if (cellMax === Infinity) {
                            hasInfinityShMax = true;
                        } else if (!hasInfinityShMax) {
                            rowShMax += cellMax;
                        }
                    }
                    if (l.id === 'CD') {
                        rowCdMin += cellMin;
                        if (cellMax === Infinity) {
                            hasInfinityCdMax = true;
                        } else if (!hasInfinityCdMax) {
                            rowCdMax += cellMax;
                        }
                    }
                    rowMin += cellMin;
                    if (cellMax === Infinity) {
                        hasInfinityMax = true;
                    } else if (!hasInfinityMax) {
                        rowMax += cellMax;
                    }
                    colStats[`${r}_${l.id}`].min += cellMin;
                    if (cellMax === Infinity) {
                        colStats[`${r}_${l.id}`].max = Infinity;
                    } else if (colStats[`${r}_${l.id}`].max !== Infinity) {
                        colStats[`${r}_${l.id}`].max += cellMax;
                    }
                });
            });
            rowStats[s.id] = {
                ALL: {min: rowMin, max: hasInfinityMax ? Infinity : rowMax},
                SH: {min: rowShMin, max: hasInfinityShMax ? Infinity : rowShMax},
                CD: {min: rowCdMin, max: hasInfinityCdMax ? Infinity : rowCdMax}
            };
            
            // 更新总合计，正确处理 Infinity
            grandTotal.ALL.min += rowMin;
            if (hasInfinityMax) {
                grandTotal.ALL.max = Infinity;
            } else if (grandTotal.ALL.max !== Infinity) {
                grandTotal.ALL.max += rowMax;
            }
            
            grandTotal.SH.min += rowShMin;
            if (hasInfinityShMax) {
                grandTotal.SH.max = Infinity;
            } else if (grandTotal.SH.max !== Infinity) {
                grandTotal.SH.max += rowShMax;
            }
            
            grandTotal.CD.min += rowCdMin;
            if (hasInfinityCdMax) {
                grandTotal.CD.max = Infinity;
            } else if (grandTotal.CD.max !== Infinity) {
                grandTotal.CD.max += rowCdMax;
            }
        });
        
        // 计算大夜班统计
        // 注意：沪合计(grandTotal.SH)和蓉合计(grandTotal.CD)不包含大夜人数
        // 只有全天总计(grandTotal.ALL)包含大夜人数
        this.LOCATIONS.forEach(l => {
            const key = `大夜_${l.id}_common`;
            const cell = this.matrix[key] || { min: null, max: null };
            const cellMin = cell.min !== null && cell.min !== undefined ? cell.min : 0;
            const cellMax = cell.max !== null && cell.max !== undefined ? cell.max : Infinity;
            colStats[`大夜_${l.id}`].min += cellMin;
            if (cellMax !== Infinity) {
                if (colStats[`大夜_${l.id}`].max === Infinity) {
                    colStats[`大夜_${l.id}`].max = cellMax;
                } else {
                    colStats[`大夜_${l.id}`].max += cellMax;
                }
            } else {
                colStats[`大夜_${l.id}`].max = Infinity;
            }
            // 沪合计和蓉合计不包含大夜人数，已移除相关累加逻辑
            // 只有全天总计包含大夜人数
            grandTotal.ALL.min += cellMin;
            if (cellMax === Infinity) {
                grandTotal.ALL.max = Infinity;
            } else if (grandTotal.ALL.max !== Infinity) {
                grandTotal.ALL.max += cellMax;
            }
            // 如果grandTotal.ALL.max已经是Infinity，保持Infinity（Infinity + 有限值 = Infinity）
        });
        
        return { rowStats, colStats, grandTotal };
    },
    
    /**
     * 绑定元素引用（用于冲突可视化）
     */
    bindElementRefs() {
        // 绑定单元格引用
        const allCells = document.querySelectorAll('[data-key]');
        allCells.forEach(cell => {
            const key = cell.getAttribute('data-key');
            if (key) {
                this.elementRefs[key] = cell;
            }
        });
        
        // 绑定规则卡片引用（用于贝塞尔连线）
        const allRuleCards = document.querySelectorAll('[data-rule-id]');
        allRuleCards.forEach(card => {
            const ruleId = card.getAttribute('data-rule-id');
            if (ruleId) {
                this.elementRefs[ruleId] = card;
            }
        });
    },
    
    /**
     * 规则悬停处理
     */
    onRuleHover(ruleId, conflictType) {
        // 先绑定元素引用，确保规则卡片引用存在
        this.bindElementRefs();
        
        const { processedRules } = this.computeRuleStatus();
        const rule = processedRules.find(r => r.id === ruleId);
        
        if (!rule) {
            return;
        }
        
        // 只有当规则有冲突时才显示连线
        if (rule.finalStatus === 'green') {
            this.onRuleLeave();
            return;
        }
        
        // 构建相关ID列表（包括相关单元格和规则）
        const relatedIds = [];
        
        if (rule.conflictType === 'violation') {
            // 违规规则：连接到相关的单元格
            console.group(`🔗 贝塞尔连线调试: ${rule.name || ruleId}`);
            console.log('规则变量:', rule.vars);
            
            rule.vars.forEach(v => {
                if (!v.startsWith('SYS_') && !v.startsWith('CUST_')) {
                    // 直接添加变量（如果存在对应的单元格）
                    if (this.elementRefs[v]) {
                        relatedIds.push(v);
                        console.log(`  ✓ 找到直接匹配: ${v}`);
                    }
                    
                    // 匹配所有相关的单元格
                    // 1. 如果变量是 "A1"，匹配 "A1_SH_xxx", "A1_CD_xxx" 等
                    // 2. 如果变量是 "合计_A1"，提取 "A1" 部分，匹配 "A1_SH_xxx", "A1_CD_xxx" 等
                    const baseVar = v.includes('_') ? v.split('_').pop() : v; // 提取最后一部分（如 "合计_A1" -> "A1"）
                    console.log(`  匹配基础变量: ${baseVar} (从 ${v} 提取)`);
                    
                    Object.keys(this.elementRefs).forEach(key => {
                        if (!key.startsWith('SYS_') && !key.startsWith('CUST_')) {
                            // 匹配以 baseVar 开头的单元格（如 "A1_SH_xxx"）
                            if (key.startsWith(baseVar + '_')) {
                                if (!relatedIds.includes(key)) {
                                    relatedIds.push(key);
                                    console.log(`  ✓ 匹配到单元格: ${key}`);
                                }
                            }
                            // 也匹配完全相同的变量名
                            else if (key === v) {
                                if (!relatedIds.includes(key)) {
                                    relatedIds.push(key);
                                    console.log(`  ✓ 完全匹配: ${key}`);
                                }
                            }
                        }
                    });
                }
            });
            
            console.log('最终相关ID列表:', relatedIds);
            console.groupEnd();
        } else if (rule.conflictType === 'caused-violation') {
            // 被阻断规则：连接到导致阻断的规则
            if (rule.relatedIds && rule.relatedIds.length > 0) {
                relatedIds.push(...rule.relatedIds);
            }
        }
        
        if (relatedIds.length === 0) {
            this.onRuleLeave();
            return;
        }
        
        this.activeHoverConflict = {
            sourceId: ruleId,
            relatedIds: relatedIds,
            type: rule.conflictType || 'violation'
        };
        
        // 再次绑定元素引用，确保所有引用都已更新
        this.bindElementRefs();
        
        // 调试信息：输出贝塞尔连线配置
        console.log('📊 贝塞尔连线配置:', {
            sourceId: ruleId,
            sourceElement: this.elementRefs[ruleId] ? '✓ 找到' : '✗ 未找到',
            relatedIds: relatedIds,
            relatedElements: relatedIds.map(id => ({
                id,
                found: this.elementRefs[id] ? '✓' : '✗'
            })),
            type: rule.conflictType || 'violation'
        });
        
        // 延迟渲染，确保DOM已更新
        setTimeout(() => {
            this.renderBezierConnections();
        }, 10);
    },
    
    /**
     * 规则离开处理
     */
    onRuleLeave() {
        this.activeHoverConflict = null;
        const svg = document.getElementById('bezierConnections');
        if (svg) {
            svg.remove();
        }
    },
    
    /**
     * 处理单元格点击（兼容旧方法）
     */
    handleCellClick(key, displayName, event) {
        this.handleAnyCellClick(key, displayName, event);
    },
    
    /**
     * 处理任意单元格点击（包括系统变量）
     */
    handleAnyCellClick(key, displayName, event) {
        // 阻止事件冒泡
        if (event) {
            event.stopPropagation();
        }
        
        // 如果在规则编辑模式，插入变量到编辑器
        if (this.isRuleMode || this.isCustomVarMode) {
            // 确保编辑器存在
            const editor = document.getElementById('ruleEditor');
            if (!editor || !document.body.contains(editor)) {
                this.renderRuleEditor();
            }
            
            // 延迟插入变量，确保编辑器已渲染
            // 使用递归延迟，直到引用被正确设置
            const tryInsertVariable = (attempts = 0) => {
                if (attempts > 10) {
                    console.error('无法插入变量：编辑器引用未正确初始化');
                    return;
                }
                
                if (this.addVariableToEditorRef && this.addVariableToEditorRef.current) {
                    this.addVariableToEditorRef.current(key, displayName);
                } else {
                    // 如果编辑器引用不存在，尝试重新初始化
                    if (attempts === 0) {
                        this.renderRuleEditor();
                    }
                    setTimeout(() => {
                        tryInsertVariable(attempts + 1);
                    }, 50);
                }
            };
            
            setTimeout(() => {
                tryInsertVariable();
            }, 50);
        } else {
            // 否则，编辑单元格或插入变量
            // 允许编辑所有单元格：基础变量、合计单元格（SYS_COL_）、统计行单元格（SYS_ROW_）和总计单元格（SYS_TOTAL_）
            if ((!key.startsWith('SYS_') && key.includes('_')) || key.startsWith('SYS_COL_') || key.startsWith('SYS_ROW_') || key.startsWith('SYS_TOTAL_')) {
                const rect = event.currentTarget.getBoundingClientRect();
                let title = "编辑", subtitle = "";
                
                // 处理总计单元格（SYS_TOTAL_）
                if (key.startsWith('SYS_TOTAL_')) {
                    const totalId = key.replace('SYS_TOTAL_', ''); // SH、CD 或 ALL
                    if (totalId === 'SH') {
                        title = '沪总';
                        subtitle = "上海总计";
                    } else if (totalId === 'CD') {
                        title = '蓉总';
                        subtitle = "成都总计";
                    } else if (totalId === 'ALL') {
                        title = '全天';
                        subtitle = "全部总计";
                    } else {
                        title = '总计';
                        subtitle = "总计";
                    }
                }
                // 处理统计行单元格（SYS_ROW_）
                else if (key.startsWith('SYS_ROW_')) {
                    const parts = key.replace('SYS_ROW_', '').split('_');
                    const locId = parts[0]; // SH、CD 或 ALL
                    const skillId = parts.slice(1).join('_'); // 技能ID
                    const loc = this.LOCATIONS.find(l => l.id === locId);
                    const skill = this.SKILLS.find(s => s.id === skillId);
                    const locName = loc ? loc.name : locId;
                    const skillName = skill ? skill.name : skillId;
                    if (locId === 'ALL') {
                        title = `总_${skillName}`;
                        subtitle = "横向合计";
                    } else {
                        title = `${locName}_${skillName}`;
                        subtitle = "横向统计";
                    }
                }
                // 处理合计单元格
                else if (key.startsWith('SYS_COL_')) {
                    const parts = key.replace('SYS_COL_', '').split('_');
                    if (parts[0] === '大夜' && parts[1] === 'ALL') {
                        title = `大夜 合计`;
                        subtitle = "通岗合计";
                    } else if (parts.length >= 3 && parts[parts.length - 2] === 'ALL') {
                        // 格式：SYS_COL_${role}_ALL_${skill.id}
                        // parts: [role, 'ALL', skillId]
                        const role = parts[0];
                        const skillId = parts[parts.length - 1]; // 最后一个元素是skillId
                        const skill = this.SKILLS.find(s => s.id === skillId);
                        title = `${role}-${skill ? skill.name : '合计'}-合计`;
                        subtitle = "总合计";
                    } else {
                        const role = parts[0];
                        const locId = parts[1];
                        const loc = this.LOCATIONS.find(l => l.id === locId);
                        title = `${role} ${loc ? loc.name : ''} 合计`;
                        subtitle = "纵向合计";
                    }
                } else if (key.startsWith('大夜')) {
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
        
        // 对于合计单元格（SYS_COL_xxx）、统计行单元格（SYS_ROW_xxx）和总计单元格（SYS_TOTAL_xxx），如果没有在matrix中，需要初始化
        // 默认值：min为0，max为null（表示无约束）
        if ((this.editingCell.id.startsWith('SYS_COL_') || this.editingCell.id.startsWith('SYS_ROW_') || this.editingCell.id.startsWith('SYS_TOTAL_')) && !this.matrix[this.editingCell.id]) {
            this.matrix[this.editingCell.id] = {min: 0, max: null};
        }
        const cell = this.matrix[this.editingCell.id] || {min: 0, max: null};
        
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
                           autofocus 
                           min="0"
                           step="1"
                           class="border border-slate-300 rounded w-full px-2 py-1.5 text-center font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none" 
                           value="${cell.min !== null && cell.min !== undefined ? cell.min : '0'}" 
                           placeholder="0"
                           oninput="DailyManpowerManager.updateCellValue('min', this.value)"
                           onchange="DailyManpowerManager.updateCellValue('min', this.value)">
            </div>
                <div class="flex-1">
                    <label class="text-[10px] font-bold text-slate-400 mb-1 block">MAX</label>
                    <input type="number" 
                           min="0"
                           step="1"
                           class="border border-slate-300 rounded w-full px-2 py-1.5 text-center font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none" 
                           value="${cell.max !== null && cell.max !== undefined && cell.max !== Infinity ? cell.max : ''}" 
                           placeholder="∞ (留空表示无约束)"
                           oninput="DailyManpowerManager.updateCellValue('max', this.value)"
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
     * 更新单元格值（仅更新输入框显示，不更新矩阵数据）
     */
    updateCellValue(type, value) {
        if (!this.editingCell) return;
        
        // 防止递归调用的标志
        if (this.editingCell._updating) return;
        this.editingCell._updating = true;
        
        try {
            // 获取输入框元素
            const editor = document.getElementById('cellEditor');
            if (!editor) return;
            
            const inputs = editor.querySelectorAll('input[type="number"]');
            const minInput = inputs[0]; // MIN 输入框
            const maxInput = inputs[1]; // MAX 输入框
            
            if (!minInput || !maxInput) return;
            
            // 解析值的辅助函数，支持 "∞" 符号
            // 最小值空时默认为0，最大值空时默认为null
            const parseMinValue = (val) => {
                if (val === '' || val === null || val === undefined) return 0;
                const trimmed = String(val).trim();
                if (trimmed === '∞' || trimmed === 'infinity' || trimmed === 'Infinity' || trimmed === 'INF') return null;
                const parsed = parseInt(trimmed);
                return isNaN(parsed) ? 0 : parsed;
            };
            const parseMaxValue = (val) => {
                if (val === '' || val === null || val === undefined) return null;
                const trimmed = String(val).trim();
                if (trimmed === '∞' || trimmed === 'infinity' || trimmed === 'Infinity' || trimmed === 'INF') return null;
                const parsed = parseInt(trimmed);
                return isNaN(parsed) ? null : parsed;
            };
            
            // 初始化临时值存储（如果不存在）
            if (!this.editingCell.tempValues) {
                // 从输入框获取当前值，支持 "∞" 符号
                // 最小值空时默认为0，最大值空时默认为null
                this.editingCell.tempValues = {
                    min: parseMinValue(minInput.value),
                    max: parseMaxValue(maxInput.value)
                };
            }
            
            // 允许空值或 "∞" 符号（表示无约束）
            const isEmpty = value === '' || value === null || value === undefined;
            const isInfinity = value === '∞' || value === 'infinity' || value === 'Infinity' || value === 'INF';
            // 最小值如果为空，默认为0；最大值如果为空，默认为null（无约束）
            const val = isEmpty || isInfinity ? (type === 'min' ? 0 : null) : Math.max(0, parseInt(value) || 0);
            
            if (type === 'min') {
                // 修改最小值（空时默认为0）
                const newMin = isEmpty ? 0 : val;
                
                // 获取当前最大值（优先从输入框获取最新值，其次从临时值获取）
                // 解析值的辅助函数，支持 "∞" 符号
                const parseValue = (val) => {
                    if (val === '' || val === null || val === undefined) return null;
                    const trimmed = String(val).trim();
                    if (trimmed === '∞' || trimmed === 'infinity' || trimmed === 'Infinity' || trimmed === 'INF') return null;
                    const parsed = parseInt(trimmed);
                    return isNaN(parsed) ? null : parsed;
                };
                
                let currentMax = null;
                if (maxInput.value !== '') {
                    currentMax = parseValue(maxInput.value);
                    if (currentMax !== null) {
                        // 同步更新临时值，确保 tempValues 始终是最新的
                        this.editingCell.tempValues.max = currentMax;
                    }
                } else if (this.editingCell.tempValues.max !== null && this.editingCell.tempValues.max !== undefined) {
                    currentMax = this.editingCell.tempValues.max;
                }
                
                // 更新最小值的临时值
                this.editingCell.tempValues.min = newMin;
                
                // 联动逻辑：如果 newMin > currentMax 且 currentMax 不为 null，则调整 max = newMin
                // 这样当最小值逐步增大超过最大值时，最大值会自动跟随调整
                // 注意：newMin现在不可能是null（空时默认为0），但需要检查是否为0
                if (newMin !== null && newMin !== undefined && currentMax !== null && newMin > currentMax) {
                    // 不满足约束条件，联动调整 max，使其不小于新的最小值
                    this.editingCell.tempValues.max = newMin;
                    
                    // 更新 max 输入框显示（不触发事件，避免循环依赖）
                    const originalOninput = maxInput.getAttribute('oninput');
                    const originalOnchange = maxInput.getAttribute('onchange');
                    maxInput.removeAttribute('oninput');
                    maxInput.removeAttribute('onchange');
                    maxInput.value = newMin;
                    if (originalOninput) maxInput.setAttribute('oninput', originalOninput);
                    if (originalOnchange) maxInput.setAttribute('onchange', originalOnchange);
                }
                
                // 注意：输入框类型为 text，不支持 min 属性，用户可以直接输入任何值包括 "∞"
                
            } else {
                // 修改最大值
                const newMax = isEmpty ? null : val;
                
                // 获取当前最小值（优先从输入框获取最新值，其次从临时值获取）
                // 解析值的辅助函数，支持 "∞" 符号（最小值空时默认为0）
                const parseMinValue = (val) => {
                    if (val === '' || val === null || val === undefined) return 0;
                    const trimmed = String(val).trim();
                    if (trimmed === '∞' || trimmed === 'infinity' || trimmed === 'Infinity' || trimmed === 'INF') return null;
                    const parsed = parseInt(trimmed);
                    return isNaN(parsed) ? 0 : parsed;
                };
                
                let currentMin = null;
                if (minInput.value !== '') {
                    currentMin = parseMinValue(minInput.value);
                    // 最小值即使解析为0也要更新（因为0是有效值）
                    this.editingCell.tempValues.min = currentMin;
                } else {
                    // 如果输入框为空，最小值默认为0
                    currentMin = 0;
                    this.editingCell.tempValues.min = 0;
                }
                
                // 更新最大值的临时值
                this.editingCell.tempValues.max = newMax;
                
                // 联动逻辑：如果 newMax < currentMin 且 currentMin 不为 null，则调整 min = newMax
                // 这样当最大值逐步减小低于最小值时，最小值会自动跟随调整
                if (newMax !== null && currentMin !== null && newMax < currentMin) {
                    // 不满足约束条件，联动调整 min，使其不大于新的最大值
                    this.editingCell.tempValues.min = newMax;
                    
                    // 更新 min 输入框显示（不触发事件，避免循环依赖）
                    const originalOninput = minInput.getAttribute('oninput');
                    const originalOnchange = minInput.getAttribute('onchange');
                    minInput.removeAttribute('oninput');
                    minInput.removeAttribute('onchange');
                    minInput.value = newMax;
                    if (originalOninput) minInput.setAttribute('oninput', originalOninput);
                    if (originalOnchange) minInput.setAttribute('onchange', originalOnchange);
                }
                
                // 注意：输入框类型为 text，不支持 min 属性，用户可以直接输入任何值包括 "∞"
            }
        } finally {
            // 清除标志
            this.editingCell._updating = false;
        }
    },
    
    /**
     * 刷新矩阵显示
     */
    refreshMatrixDisplay() {
        const stats = this.calculateStats();
        const allSkills = this.SKILLS;
        const roles = this.ROLES.filter(r => r !== '大夜');
        
        // 更新所有单元格显示（包括所有技能）
        allSkills.forEach(skill => {
            roles.forEach(role => {
                this.LOCATIONS.forEach(loc => {
                    const key = `${role}_${loc.id}_${skill.id}`;
                    const cell = this.matrix[key] || {min: null, max: null};
                    const cellEl = document.querySelector(`[data-key="${key}"]`);
                    if (cellEl) {
                        const span = cellEl.querySelector('span');
                        if (span) {
                            const minStr = cell.min !== null && cell.min !== undefined ? cell.min : '0';
                            const maxStr = cell.max !== null && cell.max !== undefined ? cell.max : '∞';
                            span.textContent = `${minStr}/${maxStr}`;
                        }
                    }
                });
            });
        });
        
        // 更新大夜班单元格显示
        this.LOCATIONS.forEach(loc => {
            const key = `大夜_${loc.id}_common`;
            const cell = this.matrix[key] || {min: null, max: null};
            const cellEl = document.querySelector(`[data-key="${key}"]`);
            if (cellEl) {
                const span = cellEl.querySelector('span');
                if (span) {
                    const minStr = cell.min !== null && cell.min !== undefined ? cell.min : '0';
                    const maxStr = cell.max !== null && cell.max !== undefined ? cell.max : '∞';
                    span.textContent = `${minStr}/${maxStr}`;
                }
            }
        });
        
        // 更新合计单元格显示（优先使用matrix中存储的值，如果没有则计算）
        allSkills.forEach(skill => {
            roles.forEach(role => {
                const totalKey = `SYS_COL_${role}_ALL_${skill.id}`;
                let totalCell = this.matrix[totalKey];
                
                if (!totalCell) {
                    // 如果没有存储的值，计算（沪+蓉）
                    const cellSH = this.matrix[`${role}_SH_${skill.id}`] || {min: null, max: null};
                    const cellCD = this.matrix[`${role}_CD_${skill.id}`] || {min: null, max: null};
                    const shMin = cellSH.min !== null && cellSH.min !== undefined ? cellSH.min : 0;
                    const shMax = cellSH.max !== null && cellSH.max !== undefined ? cellSH.max : Infinity;
                    const cdMin = cellCD.min !== null && cellCD.min !== undefined ? cellCD.min : 0;
                    const cdMax = cellCD.max !== null && cellCD.max !== undefined ? cellCD.max : Infinity;
                    const totalMin = shMin + cdMin;
                    const totalMax = (shMax === Infinity || cdMax === Infinity) ? Infinity : (shMax + cdMax);
                    totalCell = {min: totalMin, max: totalMax === Infinity ? null : totalMax};
                }
                
                const totalMinStr = totalCell.min !== null && totalCell.min !== undefined ? totalCell.min : '0';
                const totalMaxStr = totalCell.max !== null && totalCell.max !== undefined ? totalCell.max : '∞';
                const totalCellEl = document.querySelector(`[data-key="${totalKey}"]`);
                if (totalCellEl) {
                    const span = totalCellEl.querySelector('span');
                    if (span) {
                        span.textContent = `${totalMinStr}/${totalMaxStr}`;
                    }
                }
            });
        });
        
        // 更新大夜班合计单元格显示（优先使用matrix中存储的值，如果没有则计算）
        const totalKey = `SYS_COL_大夜_ALL`;
        let totalCell = this.matrix[totalKey];
        
        if (!totalCell) {
            // 如果没有存储的值，计算（沪+蓉）
            const cellSH = this.matrix['大夜_SH_common'] || {min: null, max: null};
            const cellCD = this.matrix['大夜_CD_common'] || {min: null, max: null};
            const shMin = cellSH.min !== null && cellSH.min !== undefined ? cellSH.min : 0;
            const shMax = cellSH.max !== null && cellSH.max !== undefined ? cellSH.max : Infinity;
            const cdMin = cellCD.min !== null && cellCD.min !== undefined ? cellCD.min : 0;
            const cdMax = cellCD.max !== null && cellCD.max !== undefined ? cellCD.max : Infinity;
            const totalMin = shMin + cdMin;
            const totalMax = (shMax === Infinity || cdMax === Infinity) ? Infinity : (shMax + cdMax);
            totalCell = {min: totalMin, max: totalMax === Infinity ? null : totalMax};
        }
        
        const totalMinStr = totalCell.min !== null && totalCell.min !== undefined ? totalCell.min : '0';
        const totalMaxStr = totalCell.max !== null && totalCell.max !== undefined ? totalCell.max : '∞';
        const totalCellEl = document.querySelector(`[data-key="${totalKey}"]`);
        if (totalCellEl) {
            const span = totalCellEl.querySelector('span');
            if (span) {
                span.textContent = `${totalMinStr}/${totalMaxStr}`;
            }
        }
        
        // 更新统计行（SYS_ROW_）
        allSkills.forEach(skill => {
            ['SH', 'CD', 'ALL'].forEach((locId) => {
                const sysKey = `SYS_ROW_${locId}_${skill.id}`;
                const cell = this.matrix[sysKey] || {min: null, max: null};
                const cellEl = document.querySelector(`[data-key="${sysKey}"]`);
                if (cellEl) {
                    const span = cellEl.querySelector('span');
                    if (span) {
                        const minStr = cell.min !== null && cell.min !== undefined ? cell.min : '0';
                        const maxStr = cell.max !== null && cell.max !== undefined ? (cell.max === Infinity ? '∞' : cell.max) : '∞';
                        span.textContent = `${minStr}/${maxStr}`;
                    }
                }
            });
        });
    },
    
    /**
     * 关闭单元格编辑器
     */
    closeCellEditor() {
        if (!this.editingCell) {
            const editor = document.getElementById('cellEditor');
            if (editor) editor.remove();
            return;
        }
        
        // 从输入框读取最终值并更新矩阵（只在点击完成后才更新）
        // 使用更明确的选择器：通过查找包含 "MIN" 和 "MAX" 标签的输入框
        let editor = document.getElementById('cellEditor');
        if (!editor) return;
        
        const inputs = editor.querySelectorAll('input[type="number"]');
        const minInput = inputs[0]; // 第一个输入框是 MIN
        const maxInput = inputs[1]; // 第二个输入框是 MAX
        
        if (minInput && maxInput) {
            // 直接从输入框读取值（这是用户在界面上看到的实际值）
            // 支持 "∞" 符号表示无约束
            const parseValue = (val, isMin = false) => {
                const trimmed = val.trim();
                if (trimmed === '' || trimmed === null || trimmed === undefined) {
                    // 最小值如果为空，默认为0；最大值如果为空，默认为null（无约束）
                    return isMin ? 0 : null;
                }
                if (trimmed === '∞' || trimmed === 'infinity' || trimmed === 'Infinity' || trimmed === 'INF') return null;
                const parsed = parseInt(trimmed, 10);
                return isNaN(parsed) ? (isMin ? 0 : null) : parsed;
            };
            
            const minValue = parseValue(minInput.value, true); // 最小值，空时默认为0
            const maxValue = parseValue(maxInput.value, false); // 最大值，空时默认为null（无约束）
            
            // 确保矩阵中存在该单元格
            if (!this.matrix[this.editingCell.id]) {
                this.matrix[this.editingCell.id] = {min: null, max: null};
            }
            
            // 更新矩阵数据（只在点击完成后才更新）
            // 直接使用从输入框读取的值，不做任何调整
            this.matrix[this.editingCell.id] = {
                min: minValue,
                max: maxValue
            };
            
            // 校验合计和其他单元格之间的矛盾
            this.validateCellConsistency(this.editingCell.id);
            
            // 刷新显示
            this.refreshMatrixDisplay();
        }
        
        // 清理临时值
        if (this.editingCell.tempValues) {
            delete this.editingCell.tempValues;
        }
        if (this.editingCell._updating) {
            delete this.editingCell._updating;
        }
        
        // 清理
        this.editingCell = null;
        // 使用已存在的 editor 变量
        editor = document.getElementById('cellEditor');
        if (editor) editor.remove();
    },
    
    /**
     * 校验单元格一致性，检查合计和其他单元格之间的矛盾
     * @param {string} cellKey - 被编辑的单元格key
     */
    validateCellConsistency(cellKey) {
        const stats = this.calculateStats();
        
        // 如果编辑的是统计行单元格（SYS_ROW_），检查是否与对应的基础单元格的合计匹配
        if (cellKey.startsWith('SYS_ROW_')) {
            const parts = cellKey.replace('SYS_ROW_', '').split('_');
            const locId = parts[0]; // SH、CD 或 ALL
            const skillId = parts.slice(1).join('_'); // 技能ID
            
            // 获取统计行单元格的值
            const rowCell = this.matrix[cellKey] || {min: null, max: null};
            
            // 计算实际的基础单元格合计
            let calculatedMin = 0;
            let calculatedMax = Infinity;
            const roles = this.ROLES.filter(r => r !== '大夜');
            
            roles.forEach(role => {
                const key = `${role}_${locId}_${skillId}`;
                const cell = this.matrix[key] || {min: null, max: null};
                const cellMin = cell.min !== null && cell.min !== undefined ? cell.min : 0;
                const cellMax = cell.max !== null && cell.max !== undefined ? cell.max : Infinity;
                calculatedMin += cellMin;
                if (calculatedMax !== Infinity) {
                    if (cellMax === Infinity) {
                        calculatedMax = Infinity;
                    } else {
                        calculatedMax += cellMax;
                    }
                }
            });
            
            // 检查是否有矛盾
            if (rowCell.min !== null && rowCell.min !== calculatedMin) {
                console.warn(`统计行单元格 ${cellKey} 的最小值 ${rowCell.min} 与基础单元格合计 ${calculatedMin} 不匹配`);
            }
            if (rowCell.max !== null && rowCell.max !== calculatedMax && calculatedMax !== Infinity) {
                console.warn(`统计行单元格 ${cellKey} 的最大值 ${rowCell.max} 与基础单元格合计 ${calculatedMax} 不匹配`);
            }
        }
        
        // 如果编辑的是合计单元格（SYS_COL_），检查是否与对应的基础单元格的合计匹配
        if (cellKey.startsWith('SYS_COL_')) {
            const parts = cellKey.replace('SYS_COL_', '').split('_');
            const totalCell = this.matrix[cellKey] || {min: null, max: null};
            
            // 处理不同类型的合计单元格
            if (parts[0] === '大夜' && parts[1] === 'ALL') {
                // 大夜班合计：沪+蓉
                const cellSH = this.matrix['大夜_SH_common'] || {min: null, max: null};
                const cellCD = this.matrix['大夜_CD_common'] || {min: null, max: null};
                const shMin = cellSH.min !== null && cellSH.min !== undefined ? cellSH.min : 0;
                const shMax = cellSH.max !== null && cellSH.max !== undefined ? cellSH.max : Infinity;
                const cdMin = cellCD.min !== null && cellCD.min !== undefined ? cellCD.min : 0;
                const cdMax = cellCD.max !== null && cellCD.max !== undefined ? cellCD.max : Infinity;
                const calculatedMin = shMin + cdMin;
                const calculatedMax = (shMax === Infinity || cdMax === Infinity) ? Infinity : (shMax + cdMax);
                
                if (totalCell.min !== null && totalCell.min !== calculatedMin) {
                    console.warn(`大夜班合计单元格 ${cellKey} 的最小值 ${totalCell.min} 与基础单元格合计 ${calculatedMin} 不匹配`);
                }
                if (totalCell.max !== null && totalCell.max !== calculatedMax && calculatedMax !== Infinity) {
                    console.warn(`大夜班合计单元格 ${cellKey} 的最大值 ${totalCell.max} 与基础单元格合计 ${calculatedMax} 不匹配`);
                }
            } else if (parts.length >= 3 && parts[parts.length - 2] === 'ALL') {
                // 格式：SYS_COL_${role}_ALL_${skill.id}
                const role = parts[0];
                const skillId = parts[parts.length - 1];
                const cellSH = this.matrix[`${role}_SH_${skillId}`] || {min: null, max: null};
                const cellCD = this.matrix[`${role}_CD_${skillId}`] || {min: null, max: null};
                const shMin = cellSH.min !== null && cellSH.min !== undefined ? cellSH.min : 0;
                const shMax = cellSH.max !== null && cellSH.max !== undefined ? cellSH.max : Infinity;
                const cdMin = cellCD.min !== null && cellCD.min !== undefined ? cellCD.min : 0;
                const cdMax = cellCD.max !== null && cellCD.max !== undefined ? cellCD.max : Infinity;
                const calculatedMin = shMin + cdMin;
                const calculatedMax = (shMax === Infinity || cdMax === Infinity) ? Infinity : (shMax + cdMax);
                
                if (totalCell.min !== null && totalCell.min !== calculatedMin) {
                    console.warn(`合计单元格 ${cellKey} 的最小值 ${totalCell.min} 与基础单元格合计 ${calculatedMin} 不匹配`);
                }
                if (totalCell.max !== null && totalCell.max !== calculatedMax && calculatedMax !== Infinity) {
                    console.warn(`合计单元格 ${cellKey} 的最大值 ${totalCell.max} 与基础单元格合计 ${calculatedMax} 不匹配`);
                }
            } else {
                // 格式：SYS_COL_${role}_${locId}（纵向合计）
                const role = parts[0];
                const locId = parts[1];
                const allSkills = this.SKILLS;
                let calculatedMin = 0;
                let calculatedMax = Infinity;
                
                allSkills.forEach(skill => {
                    const key = `${role}_${locId}_${skill.id}`;
                    const cell = this.matrix[key] || {min: null, max: null};
                    const cellMin = cell.min !== null && cell.min !== undefined ? cell.min : 0;
                    const cellMax = cell.max !== null && cell.max !== undefined ? cell.max : Infinity;
                    calculatedMin += cellMin;
                    if (calculatedMax !== Infinity) {
                        if (cellMax === Infinity) {
                            calculatedMax = Infinity;
                        } else {
                            calculatedMax += cellMax;
                        }
                    }
                });
                
                if (totalCell.min !== null && totalCell.min !== calculatedMin) {
                    console.warn(`纵向合计单元格 ${cellKey} 的最小值 ${totalCell.min} 与基础单元格合计 ${calculatedMin} 不匹配`);
                }
                if (totalCell.max !== null && totalCell.max !== calculatedMax && calculatedMax !== Infinity) {
                    console.warn(`纵向合计单元格 ${cellKey} 的最大值 ${totalCell.max} 与基础单元格合计 ${calculatedMax} 不匹配`);
                }
            }
        }
        
        // 如果编辑的是基础单元格，检查相关的合计单元格是否还匹配
        // 这里可以添加更多校验逻辑，比如检查横向合计和纵向合计
        // 目前先通过 refreshMatrixDisplay 中的计算来更新显示
    },
    
    /**
     * 渲染贝塞尔连线冲突可视化
     */
    renderBezierConnections() {
        // 移除旧的SVG
        const oldSvg = document.getElementById('bezierConnections');
        if (oldSvg) oldSvg.remove();
        
        if (!this.activeHoverConflict || !this.activeHoverConflict.sourceId) {
            return;
        }
        
        const { sourceId, relatedIds, type } = this.activeHoverConflict;
        const sourceEl = this.elementRefs[sourceId];
        if (!sourceEl) {
            return;
        }
        
        const paths = [];
        const sourceRect = sourceEl.getBoundingClientRect();
        
        let startX = sourceRect.left + sourceRect.width / 2;
        let startY = sourceRect.top;
        
        if (type === 'caused-violation') {
            startY = sourceRect.bottom;
        }
        
        console.group('🎨 贝塞尔曲线绘制详情');
        console.log('源元素位置:', { 
            left: sourceRect.left, 
            top: sourceRect.top, 
            width: sourceRect.width, 
            height: sourceRect.height,
            centerX: startX,
            startY: startY
        });
        
        let validPaths = 0;
        relatedIds.forEach(targetId => {
            const targetEl = this.elementRefs[targetId];
            if (!targetEl) {
                console.warn(`  ✗ 目标元素未找到: ${targetId}`);
                return;
            }
            
            const targetRect = targetEl.getBoundingClientRect();
            let endX = targetRect.left + targetRect.width / 2;
            let endY = targetRect.bottom;
            
            const isTargetBelow = targetRect.top > sourceRect.bottom;
            if (isTargetBelow) endY = targetRect.top;
            
            const distY = Math.abs(startY - endY);
            const controlStrength = Math.min(distY * 0.6, 200);
            
            let cp1X = startX, cp1Y, cp2X = endX, cp2Y;
            
            if (isTargetBelow) {
                cp1Y = startY + controlStrength;
                cp2Y = endY - controlStrength;
            } else {
                cp1Y = startY - controlStrength;
                cp2Y = endY + controlStrength;
            }
            
            const d = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
            const color = type === 'violation' ? '#ef4444' : '#f59e0b';
            
            paths.push({ id: targetId, d, color });
            validPaths++;
            
            console.log(`  ✓ 路径 ${validPaths}:`, {
                targetId,
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                controlPoints: { cp1: { x: cp1X, y: cp1Y }, cp2: { x: cp2X, y: cp2Y } },
                color,
                path: d
            });
        });
        
        console.log(`总计: ${validPaths} 条有效路径`);
        console.groupEnd();
        
        if (paths.length === 0) return;
        
        // 创建SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'bezierConnections';
        // 设置SVG的viewBox和尺寸，确保覆盖整个视口
        svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
        svg.setAttribute('width', window.innerWidth);
        svg.setAttribute('height', window.innerHeight);
        svg.setAttribute('style', 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 99999; overflow: visible;');
        
        // 定义箭头标记和滤镜效果（参考排班约束.html）
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        
        // 红色箭头标记
        const markerRed = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        markerRed.setAttribute('id', 'arrow-red');
        markerRed.setAttribute('viewBox', '0 0 10 10');
        markerRed.setAttribute('refX', '5');
        markerRed.setAttribute('refY', '5');
        markerRed.setAttribute('markerWidth', '6');
        markerRed.setAttribute('markerHeight', '6');
        markerRed.setAttribute('orient', 'auto-start-reverse');
        const pathRed = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathRed.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        pathRed.setAttribute('fill', '#ef4444');
        markerRed.appendChild(pathRed);
        
        // 黄色箭头标记
        const markerYellow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        markerYellow.setAttribute('id', 'arrow-yellow');
        markerYellow.setAttribute('viewBox', '0 0 10 10');
        markerYellow.setAttribute('refX', '5');
        markerYellow.setAttribute('refY', '5');
        markerYellow.setAttribute('markerWidth', '6');
        markerYellow.setAttribute('markerHeight', '6');
        markerYellow.setAttribute('orient', 'auto-start-reverse');
        const pathYellow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathYellow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        pathYellow.setAttribute('fill', '#f59e0b');
        markerYellow.appendChild(pathYellow);
        
        // 红色发光滤镜（参考排班约束.html）
        const filterRed = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filterRed.setAttribute('id', 'glow-red');
        filterRed.setAttribute('x', '-20%');
        filterRed.setAttribute('y', '-20%');
        filterRed.setAttribute('width', '140%');
        filterRed.setAttribute('height', '140%');
        const feDropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
        feDropShadow.setAttribute('dx', '0');
        feDropShadow.setAttribute('dy', '0');
        feDropShadow.setAttribute('stdDeviation', '2');
        feDropShadow.setAttribute('floodColor', '#fee2e2');
        feDropShadow.setAttribute('floodOpacity', '0.8');
        filterRed.appendChild(feDropShadow);
        
        defs.appendChild(markerRed);
        defs.appendChild(markerYellow);
        defs.appendChild(filterRed);
        svg.appendChild(defs);
        
        // 添加路径
        paths.forEach(p => {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            // 白色背景路径
            const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            bgPath.setAttribute('d', p.d);
            bgPath.setAttribute('stroke', 'white');
            bgPath.setAttribute('stroke-width', '6');
            bgPath.setAttribute('fill', 'none');
            bgPath.setAttribute('opacity', '0.8');
            
            // 彩色路径（红色虚线，参考排班约束.html）
            const colorPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            colorPath.setAttribute('d', p.d);
            colorPath.setAttribute('stroke', p.color);
            colorPath.setAttribute('stroke-width', '2.5');
            colorPath.setAttribute('fill', 'none');
            colorPath.setAttribute('stroke-dasharray', '6,4'); // 红色虚线样式
            colorPath.setAttribute('marker-end', `url(#arrow-${p.color === '#ef4444' ? 'red' : 'yellow'})`);
            // 为红色路径添加发光效果
            if (p.color === '#ef4444') {
                colorPath.setAttribute('filter', 'url(#glow-red)');
            }
            // 设置动画样式（SVG元素使用style属性）
            colorPath.setAttribute('style', 'animation: flow 1s linear infinite;');
            
            // 起点圆圈（从路径字符串中提取起点坐标）
            const pathMatch = p.d.match(/M\s+([\d.]+)\s+([\d.]+)/);
            if (pathMatch) {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', pathMatch[1]);
                circle.setAttribute('cy', pathMatch[2]);
                circle.setAttribute('r', '4');
                circle.setAttribute('fill', p.color);
                circle.setAttribute('stroke', 'white');
                circle.setAttribute('stroke-width', '2');
                g.appendChild(circle);
            }
            
            g.appendChild(bgPath);
            g.appendChild(colorPath);
            svg.appendChild(g);
        });
        
        // 添加动画样式
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = `
            .animate-flow { animation: flow 1s linear infinite; }
            @keyframes flow { to { stroke-dashoffset: -10; } }
        `;
        svg.appendChild(style);
        
        document.body.appendChild(svg);
        
        // 调试信息：检查SVG是否正确添加
        console.log('✅ SVG已添加到DOM:', {
            svgElement: svg,
            svgId: svg.id,
            svgStyle: svg.getAttribute('style'),
            svgParent: svg.parentElement,
            pathsCount: paths.length,
            svgChildren: svg.children.length
        });
        
        // 验证路径是否在SVG中
        const svgPaths = svg.querySelectorAll('path');
        console.log('📊 SVG中的路径数量:', svgPaths.length);
        svgPaths.forEach((path, index) => {
            console.log(`  路径 ${index + 1}:`, {
                d: path.getAttribute('d'),
                stroke: path.getAttribute('stroke'),
                strokeWidth: path.getAttribute('stroke-width'),
                strokeDasharray: path.getAttribute('stroke-dasharray')
            });
        });
        
        // 监听滚动和窗口大小变化
        const updatePaths = () => {
            const oldSvg = document.getElementById('bezierConnections');
            if (oldSvg && this.activeHoverConflict) {
                oldSvg.remove();
                this.renderBezierConnections();
            }
        };
        
        window.addEventListener('scroll', updatePaths, true);
        window.addEventListener('resize', updatePaths);
        
        // 保存清理函数
        if (!this._bezierCleanup) {
            this._bezierCleanup = () => {
                window.removeEventListener('scroll', updatePaths, true);
                window.removeEventListener('resize', updatePaths);
            };
        }
    },
    
    
    /**
     * 渲染规则编辑器
     */
    renderRuleEditor() {
        // 移除旧的编辑器，同时清理事件监听
        const oldEditor = document.getElementById('ruleEditor');
        if (oldEditor) {
            // 移除可能存在的失焦事件监听
            if (this._editorBlurHandler) {
                document.removeEventListener('click', this._editorBlurHandler, true);
                this._editorBlurHandler = null;
            }
            oldEditor.remove();
        }
        
        if (!this.isRuleMode && !this.isCustomVarMode) {
            return;
        }
        
        const mode = this.isCustomVarMode ? 'variable' : 'rule';
        const initialName = this.isCustomVarMode ? (this.editingCustomVar?.name || '') : (this.editingRule?.name || '');
        const initialLogic = this.isCustomVarMode ? (this.editingCustomVar?.logicRaw || '') : (this.editingRule?.logicRaw || '');
        const initialGroupId = this.editingRule?.groupId || (this.groups[0]?.id);
        
        const editor = document.createElement('div');
        editor.id = 'ruleEditor';
        editor.className = 'fixed bottom-0 left-0 right-0 bg-white border-t-2 border-indigo-100 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-50 flex flex-col h-[320px]';
        
        // 初始化变量插入引用（如果不存在）
        if (!this.addVariableToEditorRef) {
            this.addVariableToEditorRef = {
                current: null
            };
        }
        
        let lastSelectionRange = null;
        let previewRange = null;
        let error = null;
        
        // 创建变量chip
        const createVariableSpan = (key, varName) => {
            const style = this.getVariableStyle(key);
            const span = document.createElement('span');
            span.innerText = varName;
            span.className = `inline-flex items-center px-1.5 py-0.5 mx-1 rounded-md text-sm font-bold select-text whitespace-nowrap cursor-default align-middle border transition-colors ${style.chipBg} ${style.chipBorder} ${style.chipText}`;
            span.contentEditable = 'false';
            span.dataset.type = 'variable';
            span.dataset.key = key;
            return span;
        };
        
        // 插入变量节点
        const insertVariableNode = (container, key, varName, appendSuffix = true) => {
            const span = createVariableSpan(key, varName);
            container.appendChild(span);
            if (appendSuffix) container.appendChild(document.createTextNode(' + '));
        };
        
        // 初始化编辑器内容
        const editorRef = document.createElement('div');
        editorRef.contentEditable = 'true';
        editorRef.className = 'flex-1 bg-slate-50 border border-indigo-200 rounded-xl p-4 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-lg font-mono text-slate-700 shadow-inner leading-loose';
        editorRef.style.cssText = 'selection:bg-slate-300; selection:text-slate-900;';
        
        if (initialLogic) {
            // 解析已有逻辑
            const parts = initialLogic.split(/(\[.*?\|.*?\])/g);
            parts.forEach(part => {
                if (part.match(/^\[.*?\|.*?\]$/)) {
                    const match = part.match(/^\[(.*?)\|(.*?)\]$/);
                    if (match) {
                        const [_, key, varName] = match;
                        insertVariableNode(editorRef, key, varName, false);
                    }
                } else if (part) {
                    editorRef.appendChild(document.createTextNode(part));
                }
            });
        } else if (mode === 'rule') {
            // 新建规则时，完全置空，不添加任何占位符
            // 用户可以直接输入或点击表格中的变量进行插入
        }
        
        // 监听选择变化
        const handleSelectionChange = () => {
            const sel = window.getSelection();
            if (sel.rangeCount > 0 && editorRef.contains(sel.anchorNode)) {
                lastSelectionRange = sel.getRangeAt(0).cloneRange();
            }
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        
        // 设置变量插入函数
        this.addVariableToEditorRef.current = (key, varName) => {
            editorRef.focus();
            const span = createVariableSpan(key, varName);
            const sel = window.getSelection();
            let inserted = false;
            
            // 检查是否有占位符需要替换（优先替换光标位置的占位符）
            const placeholder = editorRef.querySelector('span[data-type="placeholder"]');
            if (placeholder) {
                placeholder.replaceWith(span);
                // 规则模式自动添加加号连接
                if (mode === 'rule' || mode === 'variable') {
                    const plusSpace = document.createTextNode(' + ');
                    span.parentNode.insertBefore(plusSpace, span.nextSibling);
                    const newRange = document.createRange();
                    newRange.setStartAfter(plusSpace);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    lastSelectionRange = newRange.cloneRange();
                } else {
                    // 设置光标到变量后面
                    const newRange = document.createRange();
                    newRange.setStartAfter(span);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    lastSelectionRange = newRange.cloneRange();
                }
                inserted = true;
            } else if (lastSelectionRange) {
                try {
                    sel.removeAllRanges();
                    sel.addRange(lastSelectionRange);
                    const range = lastSelectionRange;
                    
                    // 检查光标位置是否在占位符上
                    const node = range.startContainer;
                    let targetPlaceholder = null;
                    if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
                        targetPlaceholder = node.parentElement.querySelector('span[data-type="placeholder"]');
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        targetPlaceholder = node.querySelector('span[data-type="placeholder"]') || 
                                          (node.dataset.type === 'placeholder' ? node : null);
                    }
                    
                    if (targetPlaceholder) {
                        targetPlaceholder.replaceWith(span);
                        // 规则模式自动添加加号连接
                        if (mode === 'rule' || mode === 'variable') {
                            const plusSpace = document.createTextNode(' + ');
                            span.parentNode.insertBefore(plusSpace, span.nextSibling);
                            const newRange = document.createRange();
                            newRange.setStartAfter(plusSpace);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            lastSelectionRange = newRange.cloneRange();
                        } else {
                            const newRange = document.createRange();
                            newRange.setStartAfter(span);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            lastSelectionRange = newRange.cloneRange();
                        }
                        inserted = true;
                    } else {
                        // 检查光标位置是否在 <= 或 >= 符号上
                        // 获取光标前后的文本内容
                        const container = range.startContainer;
                        let textContent = '';
                        let cursorOffset = range.startOffset;
                        
                        if (container.nodeType === Node.TEXT_NODE) {
                            textContent = container.textContent || '';
                        } else {
                            // 如果是元素节点，获取其文本内容
                            textContent = container.textContent || container.innerText || '';
                            cursorOffset = 0;
                        }
                        
                        // 检查光标位置前后3个字符内是否有 <= 或 >=
                        const checkStart = Math.max(0, cursorOffset - 2);
                        const checkEnd = Math.min(textContent.length, cursorOffset + 3);
                        const checkText = textContent.substring(checkStart, checkEnd);
                        
                        // 如果光标在比较符号上或紧邻比较符号，不允许自动插入
                        if (/<=|>=/.test(checkText)) {
                            // 不插入变量，提示用户需要手动移动光标
                            alert('请先手动移动光标到比较符号（<= 或 >=）的前后位置，然后再插入变量');
                            return;
                        }
                        
                        // 正常插入变量
                        range.deleteContents();
                        range.insertNode(span);
                        range.collapse(false);
                        
                        // 规则模式任何时候都要添加加号
                        if (mode === 'rule' || mode === 'variable') {
                            const plusSpace = document.createTextNode(' + ');
                            range.insertNode(plusSpace);
                            range.collapse(false);
                        }
                        
                        lastSelectionRange = range.cloneRange();
                        inserted = true;
                    }
                } catch (e) {}
            }
            
            if (!inserted) {
                // 如果没有选择范围，检查是否在新建规则模式下
                if (mode === 'rule' && !initialLogic) {
                    // 查找第一个占位符并替换
                    const firstPlaceholder = editorRef.querySelector('span[data-type="placeholder"]');
                    if (firstPlaceholder) {
                        firstPlaceholder.replaceWith(span);
                        // 规则模式自动添加加号连接
                        if (mode === 'rule' || mode === 'variable') {
                            const plusSpace = document.createTextNode(' + ');
                            span.parentNode.insertBefore(plusSpace, span.nextSibling);
                            const newRange = document.createRange();
                            newRange.setStartAfter(plusSpace);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            lastSelectionRange = newRange.cloneRange();
                        } else {
                            const newRange = document.createRange();
                            newRange.setStartAfter(span);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            lastSelectionRange = newRange.cloneRange();
                        }
                    } else {
                        // 如果没有占位符，追加到末尾
                        editorRef.appendChild(span);
                        
                        // 规则模式任何时候都要添加加号（自动连接变量）
                        if (mode === 'rule' || mode === 'variable') {
                            const plusSpace = document.createTextNode(' + ');
                            editorRef.appendChild(plusSpace);
                        }
                        
                        const newRange = document.createRange();
                        newRange.selectNodeContents(editorRef);
                        newRange.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        lastSelectionRange = newRange.cloneRange();
                    }
                } else {
                    // 默认行为：追加变量
                    editorRef.appendChild(span);
                    
                    // 规则模式任何时候都要添加加号（自动连接变量）
                    if (mode === 'rule' || mode === 'variable') {
                        const plusSpace = document.createTextNode(' + ');
                        editorRef.appendChild(plusSpace);
                    }
                    
                    const newRange = document.createRange();
                    newRange.selectNodeContents(editorRef);
                    newRange.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    lastSelectionRange = newRange.cloneRange();
                }
            }
            
            handleInput();
        };
        
        // 计算表达式范围
        const evaluateLogicRange = (logicRaw, depth = 0) => {
            if (depth > 5) return { min: 0, max: 0 };
            const stats = this.calculateStats();
            
            const resolveValue = (key, type) => {
                // 处理矩阵单元格变量（如：B2_SH_星、B2_CD_星）
                if (this.matrix && this.matrix[key]) {
                    const val = this.matrix[key][type];
                    // 如果值为null或undefined，表示无约束，检查是否有对应的合计单元格
                    if (val === null || val === undefined) {
                        // 检查是否有对应的合计单元格，如果有约束值，使用合计单元格的值
                        // 格式：${role}_${loc.id}_${skill.id} -> SYS_COL_${role}_ALL_${skill.id}
                        if (!key.startsWith('SYS_') && key.includes('_')) {
                            const parts = key.split('_');
                            if (parts.length >= 3) {
                                const role = parts[0];
                                const skillId = parts.slice(2).join('_');
                                const totalKey = `SYS_COL_${role}_ALL_${skillId}`;
                                if (this.matrix && this.matrix[totalKey]) {
                                    const totalCell = this.matrix[totalKey];
                                    const totalVal = totalCell ? totalCell[type] : undefined;
                                    // 如果合计单元格有约束值，使用合计单元格的值
                                    // 因为 sumSkill 会计算所有地点的和，所以应该使用合计单元格的值
                                    if (totalVal !== null && totalVal !== undefined) {
                                        return totalVal;
                                    }
                                }
                            }
                        }
                        // 如果没有合计单元格或合计单元格也无约束，返回默认值
                        const defaultValue = type === 'min' ? 0 : Infinity;
                        return defaultValue;
                    }
                    // 如果值存在，直接返回（包括 Infinity）
                    return val;
                }
                
                // 如果基础单元格不存在，检查是否有对应的合计单元格
                if (!key.startsWith('SYS_') && key.includes('_')) {
                    const parts = key.split('_');
                    if (parts.length >= 3) {
                        const role = parts[0];
                        const skillId = parts.slice(2).join('_');
                        const totalKey = `SYS_COL_${role}_ALL_${skillId}`;
                        if (this.matrix && this.matrix[totalKey]) {
                            const totalVal = this.matrix[totalKey][type];
                            if (totalVal !== null && totalVal !== undefined) {
                                return totalVal;
                            }
                        }
                    }
                }
                
                // 处理系统变量
                if (key.startsWith('SYS_')) {
                    if (key.startsWith('SYS_TOTAL_')) {
                        const sub = key.replace('SYS_TOTAL_', '');
                        return stats.grandTotal[sub] ? stats.grandTotal[sub][type] : 0;
                    }
                    if (key.startsWith('SYS_ROW_')) {
                        const parts = key.split('_');
                        const locPart = parts[2];
                        const skillId = parts.slice(3).join('_');
                        const row = stats.rowStats[skillId];
                        return row ? (row[locPart] ? row[locPart][type] : 0) : 0;
                    }
                    if (key.startsWith('SYS_COL_')) {
                        // 优先检查matrix中是否有存储的值（合计单元格可能被用户编辑过）
                        if (this.matrix && this.matrix[key]) {
                            const val = this.matrix[key][type];
                            if (val !== null && val !== undefined) {
                                return val;
                            }
                        }
                        // 如果没有存储的值，从统计中计算
                        const suffix = key.replace('SYS_COL_', '');
                        return stats.colStats[suffix] ? stats.colStats[suffix][type] : 0;
                    }
                }
                
                // 处理自定义变量（递归）
                if (key.startsWith('CUST_')) {
                    const cv = this.customVars.find(c => c.id === key);
                    if (cv) {
                        const res = evaluateLogicRange(cv.logicRaw, depth + 1);
                        return res[type];
                    }
                }
                
                // 默认值：最小值0，最大值Infinity（无约束）
                return type === 'min' ? 0 : Infinity;
            };
            
            // 特殊处理 sumSkill 模式：([role_loc1_skill|...] + [role_loc2_skill|...])
            // 对于这种模式，应该直接使用合计单元格的值，而不是计算两个变量的和
            const replaceVars = (str, type) => {
                // 先匹配 sumSkill 模式：([role_loc1_skill|...] + [role_loc2_skill|...])
                const sumSkillPattern = /\(\[([^|]+)\|([^\]]+)\]\s*\+\s*\[([^|]+)\|([^\]]+)\]\)/g;
                let result = str;
                const matches = [];
                
                // 收集所有 sumSkill 模式的匹配
                let match;
                while ((match = sumSkillPattern.exec(str)) !== null) {
                    matches.push({
                        fullMatch: match[0],
                        key1: match[1],
                        key2: match[3],
                        index: match.index
                    });
                }
                
                // 从后往前替换，避免索引变化
                for (let i = matches.length - 1; i >= 0; i--) {
                    const m = matches[i];
                    const key1 = m.key1;
                    const key2 = m.key2;
                    
                    // 检查两个变量是否是同一角色的同一技能，只是地点不同
                    if (!key1.startsWith('SYS_') && !key2.startsWith('SYS_') && key1.includes('_') && key2.includes('_')) {
                        const parts1 = key1.split('_');
                        const parts2 = key2.split('_');
                        if (parts1.length >= 3 && parts2.length >= 3) {
                            const role1 = parts1[0];
                            const skillId1 = parts1.slice(2).join('_');
                            const role2 = parts2[0];
                            const skillId2 = parts2.slice(2).join('_');
                            
                            // 如果是同一角色的同一技能，使用合计单元格的值
                            if (role1 === role2 && skillId1 === skillId2) {
                                const totalKey = `SYS_COL_${role1}_ALL_${skillId1}`;
                                if (this.matrix && this.matrix[totalKey]) {
                                    const totalVal = this.matrix[totalKey][type];
                                    if (totalVal !== null && totalVal !== undefined) {
                                        // 替换整个 sumSkill 表达式为合计单元格的值
                                        result = result.substring(0, m.index) + totalVal + result.substring(m.index + m.fullMatch.length);
                                    }
                                }
                            }
                        }
                    }
                }
                
                // 对于其他变量，正常替换
                const finalResult = result.replace(/\[(.*?)\|(.*?)\]/g, (match, key) => {
                    const value = resolveValue(key, type);
                    return value;
                });
                return finalResult;
            };
            
            let expr = logicRaw;
            const compareIdx = logicRaw.search(/(>=|<=|==|!=|>|<|=)/);
            if (compareIdx !== -1) expr = logicRaw.substring(0, compareIdx);
            if (!expr.trim()) return { min: 0, max: 0 };
            
            const minExpr = replaceVars(expr, 'min');
            const maxExpr = replaceVars(expr, 'max');
            let minVal = 0, maxVal = 0;
            try {
                const minResult = new Function(`return ${minExpr}`)();
                const maxResult = new Function(`return ${maxExpr}`)();
                // 正确处理 Infinity：如果结果是 Infinity，保留它；否则使用结果或默认值 0
                minVal = (minResult === Infinity || minResult === -Infinity) ? minResult : (minResult || 0);
                // 对于最大值，需要特殊处理：如果结果是 NaN 或 undefined，使用 0；如果是 Infinity，保留 Infinity
                if (maxResult === Infinity || maxResult === -Infinity) {
                    maxVal = maxResult;
                } else if (maxResult === null || maxResult === undefined || isNaN(maxResult)) {
                    maxVal = 0;
                } else {
                    maxVal = maxResult;
                }
            } catch(e) {
                // 如果计算出错，保持默认值 0
            }
            
            // 检查是否有总合计单元格的约束，取较严格的约束
            // 从表达式中提取所有变量，检查是否有多个技能合计（如 B2_星+B2_综+B2_收）
            const varMatches = expr.match(/\[([^\|]+)\|([^\]]+)\]/g);
            if (varMatches && varMatches.length > 0) {
                // 提取所有角色和技能
                const roleSkillMap = new Map(); // role -> Set of skills
                varMatches.forEach(match => {
                    // match 格式: [B2_SH_星|...]，提取变量名部分
                    const keyMatch = match.match(/\[([^\|]+)\|/);
                    if (keyMatch && keyMatch[1]) {
                        const key = keyMatch[1];
                        if (!key.startsWith('SYS_') && key.includes('_')) {
                            const parts = key.split('_');
                            if (parts.length >= 3) {
                                const role = parts[0];
                                const skillId = parts.slice(2).join('_');
                                if (!roleSkillMap.has(role)) {
                                    roleSkillMap.set(role, new Set());
                                }
                                roleSkillMap.get(role).add(skillId);
                            }
                        }
                    }
                });
                
                // 对于每个角色，如果有多个技能，检查是否有总合计单元格约束
                roleSkillMap.forEach((skills, role) => {
                    if (skills.size > 1) {
                        // 有多个技能，检查是否有总合计单元格
                        const totalAllKey = `SYS_COL_${role}_ALL`;
                        if (this.matrix && this.matrix[totalAllKey]) {
                            const totalAllCell = this.matrix[totalAllKey];
                            const totalMin = totalAllCell.min;
                            const totalMax = totalAllCell.max;
                            
                            // 如果总合计单元格有约束值，取较严格的约束
                            if (totalMin !== null && totalMin !== undefined) {
                                // 最小值：取较大者（更严格的下限）
                                minVal = Math.max(minVal, totalMin);
                            }
                            if (totalMax !== null && totalMax !== undefined) {
                                // 最大值：取较小者（更严格的上限）
                                if (totalMax !== Infinity) {
                                    if (maxVal === Infinity || maxVal === -Infinity) {
                                        // 如果当前值是 Infinity，使用总合计的有限值（更严格）
                                        maxVal = totalMax;
                                    } else {
                                        // 两者都是有限值，取较小者（更严格）
                                        maxVal = Math.min(maxVal, totalMax);
                                    }
                                }
                            }
                        }
                    }
                });
            }
            
            return { min: minVal, max: maxVal };
        };
        
        // 检查实时范围
        const checkRealTimeRange = (rawString) => {
            if (/[><=]/.test(rawString) || mode === 'variable') {
                previewRange = evaluateLogicRange(rawString);
                updatePreviewRange();
            } else {
                previewRange = null;
                updatePreviewRange();
            }
        };
        
        // 更新预览范围显示
        const updatePreviewRange = () => {
            const previewEl = editor.querySelector('.preview-range');
            if (previewRange && previewEl) {
                previewEl.style.display = 'flex';
                previewEl.querySelector('span').textContent = `${previewRange.min} ~ ${previewRange.max}`;
            } else if (previewEl) {
                previewEl.style.display = 'none';
            }
        };
        
        // 处理输入
        const handleInput = () => {
            let rawString = '';
            editorRef.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    rawString += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE && node.dataset.type === 'variable') {
                    rawString += `[${node.dataset.key}|${node.innerText}]`;
                }
            });
            checkRealTimeRange(rawString);
        };
        
        editorRef.addEventListener('input', handleInput);
        editorRef.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.preventDefault();
        });
        editorRef.addEventListener('blur', () => {
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
                lastSelectionRange = sel.getRangeAt(0).cloneRange();
            }
        });
        
        // 名称输入
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = initialName;
        nameInput.className = 'border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 font-bold text-slate-700';
        nameInput.placeholder = '留空则使用表达式逻辑命名';
        
        // 规则组选择（仅规则模式）
        let groupSelect = null;
        if (mode === 'rule') {
            // 确保groups已初始化
            if (!this.groups || this.groups.length === 0) {
                this.groups = this.getDefaultGroups();
            }
            
            groupSelect = document.createElement('select');
            groupSelect.className = 'border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40 font-bold text-slate-700';
            this.groups.forEach(g => {
                const option = document.createElement('option');
                option.value = g.id;
                option.textContent = `${g.name} (Lv.${g.priority})`;
                if (g.id === initialGroupId) option.selected = true;
                groupSelect.appendChild(option);
            });
        }
        
        // 保存函数
        const handleSave = () => {
            let logicString = '', rawString = '', displayText = '';
            editorRef.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    // 保留∞符号在rawString中，但在logicString中转换为Infinity用于检查
                    const text = node.textContent;
                    logicString += text.replace(/∞/g, 'Infinity');
                    rawString += text; // rawString保留原始∞符号
                    displayText += text;
                } else if (node.nodeType === Node.ELEMENT_NODE && node.dataset.type === 'variable') {
                    logicString += ' 1 ';
                    rawString += `[${node.dataset.key}|${node.innerText}]`;
                    displayText += node.innerText;
                }
            });
            
            let checkString = logicString.trim();
            if (/[+\-*/]$/.test(checkString)) checkString = checkString.slice(0, -1);
            // 允许∞符号，将其替换为Infinity进行格式检查
            const checkStringForValidation = checkString.replace(/∞/g, 'Infinity');
            const allowedChars = /^[0-9+\-*/()><=!&|\s\.Infinitya-zA-Z]+$/;
            if (!allowedChars.test(checkStringForValidation)) {
                error = '包含非法字符';
                updateError();
                return;
            }
            
            if (mode === 'variable') {
                if (/[*/<>=]/.test(checkString)) {
                    error = '复杂变量只能使用 加号(+) 和 减号(-)';
                    updateError();
                    return;
                }
                const originalId = this.editingCustomVar?.id;
                if (originalId && rawString.includes(originalId)) {
                    error = '禁止自引用';
                    updateError();
                    return;
                }
                const normalizedNew = rawString.replace(/\s/g, '');
                const isDuplicate = this.customVars.some(v => {
                    if (v.id === originalId) return false;
                    return v.logicRaw.replace(/\s/g, '') === normalizedNew;
                });
                if (isDuplicate) {
                    error = '逻辑重复';
                    updateError();
                    return;
                }
            }
            
            // 检查比较运算符：最多允许2个 <=,>=,= 符号
            const compareOps = checkString.match(/(>=|<=|==|!=|>|<|=)/g) || [];
            if (compareOps.length > 2) {
                error = '比较运算符（<=,>=,=）最多只能出现2次';
                updateError();
                return;
            }
            
            // 如果是规则模式（不是变量模式），检查 min <= max 的逻辑矛盾
            if (mode === 'rule') {
                try {
                    // 解析 logicRaw 格式：min <= (expression) <= max
                    // 支持多种格式：数字、∞、Infinity
                    const minMaxMatch = rawString.match(/^(\d+(?:\.\d+)?|∞|Infinity)\s*<=\s*\([^)]+\)\s*<=\s*(\d+(?:\.\d+)?|∞|Infinity)$/);
                    if (minMaxMatch) {
                        const minStr = minMaxMatch[1].trim();
                        const maxStr = minMaxMatch[2].trim();
                        
                        // 将 ∞ 和 Infinity 转换为数字进行比较
                        const min = (minStr === '∞' || minStr === 'Infinity') ? Infinity : parseFloat(minStr);
                        const max = (maxStr === '∞' || maxStr === 'Infinity') ? Infinity : parseFloat(maxStr);
                        
                        // 检查 min <= max 的逻辑矛盾
                        if (!isNaN(min) && !isNaN(max)) {
                            if (min !== Infinity && max !== Infinity) {
                                // 两个都是有限值
                                if (min > max) {
                                    error = `逻辑矛盾：最小值 ${min} 不能大于最大值 ${max}`;
                                    updateError();
                                    return;
                                }
                            } else if (min === Infinity && max !== Infinity) {
                                // 最小值是无穷大，最大值是有限值，这是矛盾的
                                error = `逻辑矛盾：最小值不能是无穷大，而最大值是有限值 ${max}`;
                                updateError();
                                return;
                            }
                            // 其他情况（min 有限 max 无穷大，或两者都是无穷大）都是合法的
                        }
                    }
                } catch (e) {
                    // 解析失败，继续其他验证
                    console.warn('解析规则范围失败:', e);
                }
            }
            
            // 保存时只检查符号格式，不检查值的问题
            // 值的问题在后面的规则与变量之间的关系时进行校验
            // 将∞符号转换为Infinity进行语法检查（但不实际执行）
            let checkStringForSyntax = checkString.replace(/∞/g, 'Infinity');
            
            // 检查是否为空
            if (checkStringForSyntax.trim() === '' && rawString.trim() === '') {
                error = '表达式不能为空';
                updateError();
                return;
            }
            
            // 基本的符号格式检查（不检查值）
            try {
                // 只检查语法格式，不实际执行计算
                // 将∞替换为Infinity，将变量替换为占位符进行语法检查
                let evalString = checkStringForSyntax.replace(/([^><!])=([^=])/g, '$1==$2').replace(/AND/gi, '&&').replace(/OR/gi, '||');
                // 将变量占位符替换为数字进行语法检查
                evalString = evalString.replace(/\[.*?\|.*?\]/g, '1');
                
                // 尝试解析语法（但不执行）
                new Function(`return ${evalString}`);
                error = null;
                updateError();
                
                const finalName = nameInput.value.trim() || displayText.trim().substring(0, 40) || (mode === 'variable' ? '新变量' : '新规则');
                const finalGroupId = groupSelect ? groupSelect.value : null;
                
                // 调用handleEditorSave（返回Promise，resolve时表示成功，reject或返回null时表示失败）
                this.handleEditorSave(rawString, finalName, finalGroupId).then(savedItem => {
                    if (savedItem) {
                        // 保存成功，关闭编辑器，刷新所有页面显示，保持编辑模式
                        const editor = document.getElementById('ruleEditor');
                        if (editor) editor.remove();
                        
                        // 完整重新渲染整个页面（包括表格、规则列表等所有内容）
                        // 保存当前的编辑模式状态
                        const wasRuleMode = this.isRuleMode;
                        const wasCustomVarMode = this.isCustomVarMode;
                        
                        // 重新渲染整个表格和规则列表（使用showBaseFunctionsConfig完整重新渲染）
                        this.showBaseFunctionsConfig().then(() => {
                            // 恢复编辑模式状态
                            this.isRuleMode = wasRuleMode;
                            this.isCustomVarMode = wasCustomVarMode;
                            
                            // 如果是规则模式，重新渲染侧边栏和编辑器
                            if (!wasCustomVarMode && wasRuleMode) {
                                setTimeout(() => {
                                    this.renderVariableSidebar();
                                    setTimeout(() => {
                                        this.renderRuleEditor();
                                    }, 100);
                                }, 100);
                            } else if (wasCustomVarMode) {
                                setTimeout(() => {
                                    this.renderVariableSidebar();
                                    setTimeout(() => {
                                        this.renderRuleEditor();
                                    }, 100);
                                }, 100);
                            }
                        });
                    }
                    // 如果savedItem为null，表示保存失败，留在当前页面，不关闭编辑器
                }).catch(err => {
                    console.error('保存失败:', err);
                    // 保存失败，留在当前页面，不关闭编辑器
                    error = '保存失败：' + (err.message || '未知错误');
                    updateError();
                });
            } catch (e) {
                error = '语法格式错误';
                updateError();
                // 校验失败，留在当前页面
            }
        };
        
        // 更新错误显示
        const updateError = () => {
            const errorEl = editor.querySelector('.error-message');
            if (error) {
                if (!errorEl) {
                    const errDiv = document.createElement('div');
                    errDiv.className = 'error-message mt-2 text-red-500 text-sm flex items-center gap-1 animate-pulse shrink-0 font-bold bg-red-50 p-1 rounded border border-red-100';
                    errDiv.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> ${error}`;
                    editor.appendChild(errDiv);
                } else {
                    errorEl.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> ${error}`;
                }
            } else if (errorEl) {
                errorEl.remove();
            }
        };
        
        // 构建编辑器HTML
        editor.innerHTML = `
            <div class="flex h-full">
                <div class="flex-1 p-4 flex flex-col">
                    <div class="flex items-center justify-between mb-3 shrink-0">
                        <div class="flex items-center gap-3">
                            <div class="flex items-center gap-2 text-indigo-800 font-bold bg-indigo-50 px-3 py-1 rounded-lg">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>${mode === 'variable' ? '变量配置' : '规则配置'}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-slate-500 font-bold">名称:</span>
                            </div>
                            ${mode === 'rule' ? '<div class="flex items-center gap-2"><span class="text-sm text-slate-500 font-bold">规则组:</span></div>' : ''}
                        </div>
                        <div class="preview-range flex items-center gap-2 animate-in fade-in zoom-in duration-300" style="display: none;">
                            <span class="text-xs text-slate-500 font-medium">当前计算范围:</span>
                            <span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-sm font-bold border border-indigo-200 shadow-sm font-mono"></span>
                        </div>
                    </div>
                    <div class="flex-1 flex gap-4 min-h-0">
                        <div class="flex flex-col gap-2 w-32 shrink-0">
                            <div class="flex gap-2">
                                <button class="infinity-btn w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xl flex items-center justify-center cursor-pointer border border-slate-300 transition-colors" title="插入∞符号">∞</button>
                                <button class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition-colors text-sm flex items-center justify-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    保存
                                </button>
                            </div>
                            <button class="h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium" data-action="cancel">取消</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 插入名称输入框和组选择
        const nameContainer = editor.querySelector('.flex.items-center.gap-3');
        nameContainer.insertBefore(nameInput, nameContainer.querySelector('.flex.items-center.gap-2').nextSibling);
        if (groupSelect) {
            const groupContainer = editor.querySelector('.flex.items-center.gap-2:last-of-type');
            groupContainer.appendChild(groupSelect);
        }
        
        // 插入编辑器
        const editorContainer = editor.querySelector('.flex-1.flex.gap-4');
        editorContainer.insertBefore(editorRef, editorContainer.firstChild);
        
        // 绑定∞符号按钮
        const infinityBtn = editor.querySelector('.infinity-btn');
        if (infinityBtn) {
            // 使用mousedown在捕获阶段处理，确保在blur之前执行
            infinityBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // 立即执行插入操作，不延迟
                // 确保编辑器获得焦点
                editorRef.focus();
                
                const sel = window.getSelection();
                let range;
                
                // 获取当前选择范围
                if (sel.rangeCount > 0) {
                    range = sel.getRangeAt(0);
                    // 检查range是否在editorRef内
                    if (!editorRef.contains(range.commonAncestorContainer)) {
                        // 如果不在，创建新的range并定位到末尾
                        range = document.createRange();
                        range.selectNodeContents(editorRef);
                        range.collapse(false);
                    }
                } else {
                    // 如果没有选择，创建新的range并定位到末尾
                    range = document.createRange();
                    range.selectNodeContents(editorRef);
                    range.collapse(false);
                }
                
                // 插入∞符号
                const textNode = document.createTextNode('∞');
                
                // 删除已选择的内容（如果有）
                range.deleteContents();
                
                // 插入文本节点
                range.insertNode(textNode);
                
                // 将光标定位到插入的文本之后
                range.setStartAfter(textNode);
                range.collapse(true);
                
                // 更新选择
                sel.removeAllRanges();
                sel.addRange(range);
                
                // 确保编辑器保持焦点
                editorRef.focus();
                
                // 触发input事件以更新预览
                editorRef.dispatchEvent(new Event('input', { bubbles: true }));
                handleInput();
            }, true); // 使用捕获阶段，确保在其他事件之前处理
            
            // 同时处理click事件，确保阻止默认行为
            infinityBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
        }
        
        // 绑定保存和取消按钮
        const saveBtn = editor.querySelector('button.bg-indigo-600');
        saveBtn.onclick = handleSave;
        const cancelBtn = editor.querySelector('button[data-action="cancel"]');
        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                // 阻止事件冒泡，避免被 handleEditorBlur 拦截
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // 取消编辑，关闭编辑器并返回上一个页面
                // 清理编辑器相关的事件监听
                document.removeEventListener('selectionchange', handleSelectionChange);
                
                // 移除失焦事件监听
                if (this._editorBlurHandler) {
                    document.removeEventListener('click', this._editorBlurHandler, true);
                    this._editorBlurHandler = null;
                }
                
                // 调用关闭编辑模式函数，返回矩阵页面
                this.closeEditorMode();
            };
        }
        
        // 添加失焦检测：点击编辑器外部时，关闭编辑器（但保持编辑模式）
        const handleEditorBlur = (e) => {
            const editorEl = document.getElementById('ruleEditor');
            if (!editorEl || !document.body.contains(editorEl)) {
                return;
            }
            
            // 检查点击是否在编辑器或侧边栏上
            const sidebar = document.getElementById('variableSidebar');
            const clickTarget = e.target;
            
            // 特别检查是否是∞按钮或其父元素
            const infinityBtn = clickTarget.closest('.infinity-btn');
            if (infinityBtn) {
                // 点击了∞按钮，不关闭编辑器
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            // 如果点击在编辑器或侧边栏上，不关闭
            if (editorEl.contains(clickTarget) || (sidebar && sidebar.contains(clickTarget))) {
                // 特别检查是否是取消按钮，如果是则允许其处理
                const cancelBtn = clickTarget.closest('button[data-action="cancel"]');
                if (cancelBtn) {
                    // 取消按钮会自己处理，这里不拦截
                    return;
                }
                return;
            }
            
            // 检查是否点击了新建规则或变量管理按钮
            const header = document.querySelector('header');
            if (header && header.contains(clickTarget)) {
                const button = clickTarget.closest('button');
                if (button) {
                    const onclickAttr = button.getAttribute('onclick');
                    // 如果是新建规则或变量管理按钮，不关闭编辑器
                    if (onclickAttr && (onclickAttr.includes('toggleRuleMode') || onclickAttr.includes('toggleCustomVarMode'))) {
                        return;
                    }
                }
                // 其他header按钮，关闭编辑模式并返回矩阵
                this.closeEditorMode();
                return;
            }
            
            // 检查是否点击了矩阵格子
            const table = document.querySelector('table');
            if (table && table.contains(clickTarget)) {
                // 点击了表格，不关闭编辑器
                return;
            }
            
            // 点击在外部且不是矩阵格子，关闭编辑器但保持编辑模式
            editorEl.remove();
            document.removeEventListener('selectionchange', handleSelectionChange);
            
            // 移除失焦事件监听
            if (this._editorBlurHandler) {
                document.removeEventListener('click', this._editorBlurHandler, true);
                this._editorBlurHandler = null;
            }
            
            // 如果处于变量管理模式，保持侧边栏显示
            if (this.isCustomVarMode) {
                this.renderVariableSidebar();
            }
        };
        
        // 保存事件处理器的引用，以便后续清理
        this._editorBlurHandler = handleEditorBlur;
        
        // 延迟添加监听，避免立即触发
        setTimeout(() => {
            document.addEventListener('click', handleEditorBlur, true);
        }, 200);
        
        document.body.appendChild(editor);
    },
    
    /**
     * 处理编辑器保存
     */
    handleEditorSave(logicRaw, name, groupId) {
        let savedItem = null;
        
        if (this.isCustomVarMode) {
            if (this.editingCustomVar) {
                this.editingCustomVar.name = name;
                this.editingCustomVar.logicRaw = logicRaw;
                savedItem = this.editingCustomVar;
            } else {
                savedItem = {
                    id: `CUST_${Date.now()}`,
                    name,
                    logicRaw
                };
                this.customVars.push(savedItem);
            }
            // 保存后不清除编辑模式，保持在变量库页面
            this.editingCustomVar = null;
        } else {
            if (this.editingRule) {
                this.editingRule.name = name;
                this.editingRule.logicRaw = logicRaw;
                this.editingRule.groupId = groupId;
                savedItem = this.editingRule;
            } else {
                savedItem = {
                    id: `rule_${Date.now()}`,
                    name,
                    logicRaw,
                    groupId: groupId || this.groups[0]?.id
                };
                this.rules.push(savedItem);
            }
            // 保存后不清除编辑模式
            this.editingRule = null;
        }
        
        // 保存配置
        return this.saveCurrentConfig().then(() => {
            // 返回保存的项目，表示保存成功
            return savedItem;
        }).catch(err => {
            console.error('保存配置失败:', err);
            alert('保存失败：' + err.message);
            // 返回null表示保存失败
            return null;
        });
    },
    
    /**
     * 渲染变量侧边栏
     */
    renderVariableSidebar() {
        // 移除旧的侧边栏
        const oldSidebar = document.getElementById('variableSidebar');
        if (oldSidebar) oldSidebar.remove();
        
        if (!this.isRuleMode && !this.isCustomVarMode) {
            return;
        }
        
        const sidebar = document.createElement('div');
        sidebar.id = 'variableSidebar';
        sidebar.className = 'w-80 bg-slate-50 border-l border-slate-200 flex flex-col h-full shadow-xl z-40 fixed right-0 top-16 bottom-0';
        
        // 变量侧边栏只显示自定义变量（CUST_），系统变量通过点击表格单元格插入
        const availableVars = [];
        
        // 只添加自定义变量
        this.customVars.forEach(cv => {
            availableVars.push({
                key: cv.id,
                name: cv.name,
                type: 'custom'
            });
        });
        
        sidebar.innerHTML = `
            <div class="p-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm">
                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                    <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    变量库
                </h3>
                <button class="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-md hover:bg-orange-200 flex items-center gap-1 font-bold border border-orange-200 shadow-sm transition-all active:scale-95">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    新建
                </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/50">
                ${availableVars.map(v => {
                    const style = this.getVariableStyle(v.key);
                    return `
                        <div class="bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-md transition-all group relative overflow-hidden">
                            <div class="flex justify-between items-center p-2.5 bg-slate-50/50 border-b border-slate-100">
                                <div class="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onclick="DailyManpowerManager.insertVariable('${v.key.replace(/'/g, "\\'")}', '${v.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">
                                    <span class="text-xs ${style.chipBg} ${style.chipText} px-1.5 py-0.5 rounded border ${style.chipBorder} font-bold shrink-0">${v.type === 'custom' ? 'Var' : v.type === 'sys' ? 'Sys' : 'Cell'}</span>
                                    <span class="text-sm font-bold text-slate-700 group-hover:text-orange-700 transition-colors truncate" title="${v.name}">${v.name}</span>
                                </div>
                                ${v.type === 'custom' ? `
                                    <div class="flex items-center gap-1 ml-2">
                                        <button onclick="DailyManpowerManager.editCustomVar('${v.key}')" class="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 rounded shadow-sm" title="修改">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button onclick="DailyManpowerManager.renameCustomVar('${v.key}')" class="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 rounded shadow-sm" title="重命名">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
                                            </svg>
                                        </button>
                                        <button onclick="DailyManpowerManager.copyCustomVar('${v.key}')" class="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-green-600 hover:border-green-300 rounded shadow-sm" title="复制">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </button>
                                        <button onclick="DailyManpowerManager.deleteCustomVar('${v.key}')" class="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-300 rounded shadow-sm" title="删除">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                            ${v.type === 'custom' ? `
                                <div onclick="DailyManpowerManager.insertVariable('${v.key.replace(/'/g, "\\'")}', '${v.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" class="p-2 cursor-pointer hover:bg-orange-50/30">
                                    <div class="text-xs font-mono text-slate-600 bg-white/60 p-2 rounded break-all leading-relaxed border border-transparent border-slate-100">
                                        ${this.renderLogicDisplay(this.customVars.find(c => c.id === v.key)?.logicRaw || '')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        // 绑定新建按钮
        const newBtn = sidebar.querySelector('button');
        newBtn.onclick = () => {
            this.isCustomVarMode = true;
            this.isRuleMode = false;
            this.editingCustomVar = null;
            this.renderRuleEditor();
            this.renderVariableSidebar();
        };
        
        document.body.appendChild(sidebar);
    },
    
    /**
     * 插入变量到编辑器
     */
    insertVariable(key, name) {
        if (this.addVariableToEditorRef && this.addVariableToEditorRef.current) {
            this.addVariableToEditorRef.current(key, name);
        } else {
            console.warn('变量插入引用未初始化');
            // 尝试重新初始化
            const editor = document.getElementById('ruleEditor');
            if (editor && (this.isRuleMode || this.isCustomVarMode)) {
                // 重新渲染编辑器
                this.renderRuleEditor();
            }
        }
    },
    
    /**
     * 编辑自定义变量
     */
    editCustomVar(varId) {
        const customVar = this.customVars.find(c => c.id === varId);
        if (customVar) {
            this.isCustomVarMode = true;
            this.isRuleMode = false;
            this.editingCustomVar = customVar;
            this.renderRuleEditor();
            this.renderVariableSidebar();
        }
    },
    
    /**
     * 复制自定义变量
     */
    copyCustomVar(varId) {
        const customVar = this.customVars.find(c => c.id === varId);
        if (customVar) {
            this.customVars.push({
                ...customVar,
                id: `CUST_${Date.now()}`,
                name: customVar.name + ' (Copy)'
            });
            this.saveCurrentConfig().then(() => {
                this.renderVariableSidebar();
            });
        }
    },
    
    /**
     * 重命名自定义变量
     */
    renameCustomVar(varId) {
        const customVar = this.customVars.find(c => c.id === varId);
        if (customVar) {
            const newName = prompt('请输入新名称：', customVar.name);
            if (newName && newName.trim()) {
                customVar.name = newName.trim();
                this.saveCurrentConfig().then(() => {
                    this.renderVariableSidebar();
                });
            }
        }
    },
    
    /**
     * 删除自定义变量
     */
    deleteCustomVar(varId) {
        if (confirm('确定要删除这个自定义变量吗？')) {
            this.customVars = this.customVars.filter(c => c.id !== varId);
            this.saveCurrentConfig().then(() => {
                this.renderVariableSidebar();
                // 重新渲染当前视图
                if (this.currentView === 'baseFunctions') {
                    this.showBaseFunctionsConfig();
                } else if (this.currentView === 'businessFunctions') {
                    this.showBusinessFunctionsConfig();
                } else if (this.currentView === 'complexRules') {
                    this.showComplexRulesConfig();
                }
            });
        }
    },
    
    /**
     * 重命名规则
     */
    renameRule(ruleId) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (rule) {
            const newName = prompt('请输入新名称：', rule.name);
            if (newName && newName.trim()) {
                rule.name = newName.trim();
                this.saveCurrentConfig().then(() => {
                    if (this.currentView === 'baseFunctions') {
                        this.showBaseFunctionsConfig();
                    } else if (this.currentView === 'businessFunctions') {
                        this.showBusinessFunctionsConfig();
                    } else if (this.currentView === 'complexRules') {
                        this.showComplexRulesConfig();
                    }
                });
            }
        }
    },
    
    /**
     * 渲染逻辑显示（用于变量侧边栏）
     */
    renderLogicDisplay(logicRaw) {
        if (!logicRaw) return '';
        const parts = logicRaw.split(/(\[.*?\|.*?\])/g);
        return parts.map((part, i) => {
            if (part.startsWith('[') && part.endsWith(']')) {
                const match = part.match(/^\[(.*?)\|(.*?)\]$/);
                if (match) {
                    const [_, key, name] = match;
                    const style = this.getVariableStyle(key);
                    return `<span class="inline-block px-1 rounded border font-bold mx-0.5 ${style.chipBg} ${style.chipBorder} ${style.chipText}">${name}</span>`;
                }
            }
            return `<span class="font-bold text-slate-500">${part}</span>`;
        }).join('');
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
        
        // 如果没有当前配置ID，尝试从Store中获取激活的配置ID
        if (!this.currentConfigId && typeof Store !== 'undefined') {
            const activeConfigId = Store.getState('activeDailyManpowerConfigId');
            if (activeConfigId) {
                this.currentConfigId = activeConfigId;
            }
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
        this.ensureRuleState(config);
        
        // 确保默认约束被应用（补充缺失的约束，不覆盖用户已修改的值）
        this.ensureDefaultConstraints();
        
        // 只显示业务职能的技能
        const bizSkills = this.SKILLS.filter(s => s.category === 'biz');
        // 只显示非大夜的角色
        const roles = this.ROLES.filter(r => r !== '大夜');
        
        // 计算统计数据
        const stats = this.calculateStats();
        const { cellConflictStatus } = this.computeRuleStatus();
        
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
                            <button onclick="DailyManpowerManager.toggleRuleMode()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${this.isRuleMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}">
                                ${this.isRuleMode ? '关闭编辑' : '新建规则'}
                            </button>
                            <button onclick="DailyManpowerManager.toggleCustomVarMode()" 
                                    class="px-3 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${this.isCustomVarMode ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-orange-600 border border-orange-200 hover:bg-orange-50'}">
                                ${this.isCustomVarMode ? '完成配置' : '变量管理'}
                            </button>
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

                <main class="flex-1 overflow-auto p-6 relative pb-20 ${this.isRuleMode || this.isCustomVarMode ? 'mr-80 pb-96' : 'pb-20'}">
                    <div class="max-w-[1600px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                        <div class="overflow-x-auto max-h-[65vh]">
                            <table class="w-full border-collapse text-sm table-fixed relative">
                                <thead class="sticky top-0 z-30 shadow-md">
                                    <tr>
                                        <th class="w-32 sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-3 text-left font-bold text-slate-700 shadow-[1px_0_0_rgba(0,0,0,0.05)]">职能 \\ 班次</th>
                                        ${roles.map(role => `
                                            <th key="${role}" colSpan="3" class="border-b border-r border-slate-200 p-2 text-slate-800 font-bold text-center sticky top-0 ${role === '大夜' ? 'bg-indigo-50 text-indigo-900' : 'bg-slate-100'}">${role}</th>
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
                                                    const isConflict = cellConflictStatus[key] === 'yellow';
                                return `
                                                        <td key="${key}" 
                                                            data-key="${key}"
                                                            onclick="DailyManpowerManager.handleAnyCellClick('${key}', '${loc.name}_${role}_${skill.name}', event)" 
                                                            class="cursor-pointer border-b border-r border-slate-100 p-0 relative transition-colors ${isConflict ? 'bg-amber-100 border-amber-300 ring-1 ring-inset ring-amber-400' : 'hover:bg-slate-50'}"
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
                                                    data-stat="${skill.id}_${col.id}"
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
                                                            <span class="text-[10px] font-bold text-slate-500 mb-0.5">${role} ${loc.name}</span>
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
        
        // 渲染规则编辑器和变量侧边栏（如果处于编辑模式）
        setTimeout(() => {
            if (this.isRuleMode || this.isCustomVarMode) {
                this.renderRuleEditor();
                this.renderVariableSidebar();
            }
            
            // 规则展示已在HTML模板中渲染，无需额外调用
        }, 100);
    },
    
    /**
     * 切换规则编辑模式
     */
    toggleRuleMode() {
        const wasRuleMode = this.isRuleMode;
        this.isRuleMode = !this.isRuleMode;
        
        if (this.isRuleMode) {
            // 打开规则编辑模式
            this.isCustomVarMode = false;
            this.editingRule = null;
            
            // 更新main元素的margin-right
            const tableContainer = document.getElementById('tableContainer');
            if (tableContainer) {
                tableContainer.classList.add('mr-80');
                tableContainer.classList.add('pb-96');
                tableContainer.classList.remove('pb-20');
            }
            
            // 自动打开变量库页面
            this.renderVariableSidebar();
            this.renderRuleEditor();
            
            // 更新按钮文本
            this.updateButtonTexts();
        } else {
            // 关闭规则编辑模式，返回矩阵页面
            this.editingRule = null;
            
            // 更新main元素的margin-right
            const tableContainer = document.getElementById('tableContainer');
            if (tableContainer) {
                if (!this.isCustomVarMode) {
                    tableContainer.classList.remove('mr-80');
                    tableContainer.classList.remove('pb-96');
                    tableContainer.classList.add('pb-20');
                }
            }
            
            // 移除编辑器和侧边栏
            const editor = document.getElementById('ruleEditor');
            if (editor) editor.remove();
            if (!this.isCustomVarMode) {
                const sidebar = document.getElementById('variableSidebar');
                if (sidebar) sidebar.remove();
            }
            
            // 重新渲染当前视图（返回矩阵页面）
            if (this.currentView === 'baseFunctions') {
                this.showBaseFunctionsConfig();
            } else if (this.currentView === 'businessFunctions') {
                this.showBusinessFunctionsConfig();
            } else if (this.currentView === 'complexRules') {
                this.showComplexRulesConfig();
            }
        }
    },
    
    /**
     * 切换自定义变量编辑模式
     */
    toggleCustomVarMode() {
        const wasCustomVarMode = this.isCustomVarMode;
        this.isCustomVarMode = !this.isCustomVarMode;
        
        if (this.isCustomVarMode) {
            // 打开变量管理模式
            this.isRuleMode = false;
            // 默认打开一个新建变量的编辑器
            this.editingCustomVar = null;
            
            // 更新main元素的margin-right
            const tableContainer = document.getElementById('tableContainer');
            if (tableContainer) {
                tableContainer.classList.add('mr-80');
                tableContainer.classList.add('pb-96');
                tableContainer.classList.remove('pb-20');
            }
            
            // 自动打开变量库页面并新建变量编辑器
            this.renderVariableSidebar();
            setTimeout(() => {
                this.renderRuleEditor(); // 自动打开新建变量编辑器
            }, 100);
            
            // 更新按钮文本
            this.updateButtonTexts();
        } else {
            // 关闭变量管理模式，返回矩阵页面
            this.editingCustomVar = null;
            
            // 更新main元素的margin-right
            const tableContainer = document.getElementById('tableContainer');
            if (tableContainer) {
                if (!this.isRuleMode) {
                    tableContainer.classList.remove('mr-80');
                    tableContainer.classList.remove('pb-96');
                    tableContainer.classList.add('pb-20');
                }
            }
            
            // 移除编辑器和侧边栏
            const editor = document.getElementById('ruleEditor');
            if (editor) editor.remove();
            if (!this.isRuleMode) {
                const sidebar = document.getElementById('variableSidebar');
                if (sidebar) sidebar.remove();
            }
            
            // 更新按钮文本
            this.updateButtonTexts();
            
            // 重新渲染当前视图（返回矩阵页面）
            if (this.currentView === 'baseFunctions') {
                this.showBaseFunctionsConfig();
            } else if (this.currentView === 'businessFunctions') {
                this.showBusinessFunctionsConfig();
            } else if (this.currentView === 'complexRules') {
                this.showComplexRulesConfig();
            }
        }
    },
    
    /**
     * 更新按钮文本
     */
    updateButtonTexts() {
        const header = document.querySelector('header');
        if (!header) return;
        
        // 更新变量管理按钮
        const varBtn = header.querySelector('button[onclick*="toggleCustomVarMode"]');
        if (varBtn) {
            // 保存onclick事件
            const onclickAttr = varBtn.getAttribute('onclick');
            const svg = varBtn.querySelector('svg');
            
            // 更新文本内容（只更新文本节点，保留SVG和事件）
            const textNode = Array.from(varBtn.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) {
                textNode.textContent = ` ${this.isCustomVarMode ? '完成配置' : '变量管理'}`;
            } else {
                // 如果没有文本节点，创建一个新的
                varBtn.appendChild(document.createTextNode(` ${this.isCustomVarMode ? '完成配置' : '变量管理'}`));
            }
            
            // 更新样式
            varBtn.className = `px-3 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${this.isCustomVarMode ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-orange-600 border border-orange-200 hover:bg-orange-50'}`;
            
            // 确保onclick事件仍然存在
            if (onclickAttr && !varBtn.getAttribute('onclick')) {
                varBtn.setAttribute('onclick', onclickAttr);
            }
        }
        
        // 更新新建规则按钮
        const ruleBtn = header.querySelector('button[onclick*="toggleRuleMode"]');
        if (ruleBtn) {
            // 保存onclick事件
            const onclickAttr = ruleBtn.getAttribute('onclick');
            const svg = ruleBtn.querySelector('svg');
            
            // 更新文本内容（只更新文本节点，保留SVG和事件）
            const textNode = Array.from(ruleBtn.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) {
                textNode.textContent = ` ${this.isRuleMode ? '关闭编辑' : '新建规则'}`;
            } else {
                // 如果没有文本节点，创建一个新的
                ruleBtn.appendChild(document.createTextNode(` ${this.isRuleMode ? '关闭编辑' : '新建规则'}`));
            }
            
            // 更新样式
            ruleBtn.className = `px-3 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${this.isRuleMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}`;
            
            // 确保onclick事件仍然存在
            if (onclickAttr && !ruleBtn.getAttribute('onclick')) {
                ruleBtn.setAttribute('onclick', onclickAttr);
            }
        }
    },
    
    /**
     * 关闭编辑模式，返回矩阵页面
     */
    closeEditorMode() {
        this.isRuleMode = false;
        this.isCustomVarMode = false;
        this.editingRule = null;
        this.editingCustomVar = null;
        
        // 移除编辑器
        const editor = document.getElementById('ruleEditor');
        if (editor) editor.remove();
        
        // 移除侧边栏
        const sidebar = document.getElementById('variableSidebar');
        if (sidebar) sidebar.remove();
        
        // 清理失焦事件监听
        if (this._editorBlurHandler) {
            document.removeEventListener('click', this._editorBlurHandler, true);
            this._editorBlurHandler = null;
        }
        
        // 更新main元素的margin-right
        const tableContainer = document.getElementById('tableContainer');
        if (tableContainer) {
            tableContainer.classList.remove('mr-80');
            tableContainer.classList.remove('pb-96');
            tableContainer.classList.add('pb-20');
        }
        
        // 重新渲染当前视图（返回矩阵页面）
        if (this.currentView === 'baseFunctions') {
            this.showBaseFunctionsConfig();
        } else if (this.currentView === 'businessFunctions') {
            this.showBusinessFunctionsConfig();
        } else if (this.currentView === 'complexRules') {
            this.showComplexRulesConfig();
        }
    },
    
    /**
     * 清空矩阵
     */
    clearMatrix() {
        if (confirm('确定要清空矩阵吗？')) {
            this.matrix = this.generateInitialMatrix();
            this.saveCurrentConfig().then(() => {
                if (this.currentView === 'baseFunctions') {
                    this.showBaseFunctionsConfig();
                }
            });
        }
    },
    
    /**
     * 编辑规则
     */
    editRule(ruleId) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (rule) {
            this.editingRule = rule;
            this.isRuleMode = true;
            this.isCustomVarMode = false;
            this.renderRuleEditor();
            this.renderVariableSidebar();
        }
    },
    
    /**
     * 复制规则
     */
    copyRule(ruleId) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (rule) {
            this.rules.push({
                ...rule,
                id: `rule_${Date.now()}`,
                name: rule.name + ' (Copy)'
            });
            this.saveCurrentConfig().then(() => {
                if (this.currentView === 'baseFunctions') {
                    this.showBaseFunctionsConfig();
                }
            });
        }
    },
    
    /**
     * 删除规则
     */
    deleteRule(ruleId) {
        if (confirm('确定要删除这条规则吗？')) {
            this.rules = this.rules.filter(r => r.id !== ruleId);
            this.saveCurrentConfig().then(() => {
                if (this.currentView === 'baseFunctions') {
                    this.showBaseFunctionsConfig();
                }
            });
        }
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
        
        // 如果没有当前配置ID，尝试从Store中获取激活的配置ID
        if (!this.currentConfigId && typeof Store !== 'undefined') {
            const activeConfigId = Store.getState('activeDailyManpowerConfigId');
            if (activeConfigId) {
                this.currentConfigId = activeConfigId;
            }
        }
        
        // 加载当前配置
        let config = await this.loadCurrentConfig();
        if (config) {
            // 如果配置存在，转换为矩阵格式
            if (config.baseFunctions || config.businessFunctions) {
                this.matrix = this.convertToMatrix(config.baseFunctions, config.businessFunctions);
            } else if (config.matrix) {
                // 如果已有矩阵数据，直接使用
                this.matrix = config.matrix;
            } else {
                this.matrix = this.generateInitialMatrix();
            }
        } else {
            this.matrix = this.generateInitialMatrix();
        }
        this.ensureRuleState(config);
        
        // 确保默认约束被应用（补充缺失的约束，不覆盖用户已修改的值）
        this.ensureDefaultConstraints();
        
        if (config && config.complexRules && (!config.rules || config.rules.length === 0)) {
            // 兼容旧字段：将 complexRules 转存为 rules（简单映射，表达式放入 logicRaw）
            this.rules = config.complexRules.map(r => ({
                id: `compat_${r.id}`,
                name: r.name,
                logicRaw: r.expression || '',
                groupId: r.isLocationRule ? 'g3' : 'g2',
                min: r.min,
                max: r.max,
                enabled: r.enabled !== false
            }));
        }
        const { processedRules, groupStatus } = this.computeRuleStatus();
        const complexRules = processedRules;
        
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
                                <div class="flex items-center gap-2">
                                    <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                        <span class="bg-indigo-100 text-indigo-700 w-6 h-6 flex items-center justify-center rounded text-xs font-mono">1</span>
                                        组合规则
                                    </h3>
                                    <span class="text-xs font-bold px-2 py-1 rounded-full ${groupStatus?.g2?.status === 'invalid' ? 'bg-red-100 text-red-700 border border-red-200' : groupStatus?.g2?.status === 'warning' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}">
                                        ${groupStatus?.g2?.text || '状态未知'}
                                    </span>
                                </div>
                            </div>
                            <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${comboRules.length === 0 ? '<div class="text-slate-400 text-sm italic col-span-full py-4 text-center">暂无组合规则</div>' : ''}
                                ${comboRules.map(rule => `
                                    <div class="p-4 rounded-xl border-2 transition-all relative group shadow-sm ${
                                        rule.finalStatus === 'red' ? 'border-red-200 bg-red-50 hover:shadow-red-100' : 
                                        rule.finalStatus === 'yellow' ? 'border-amber-200 bg-amber-50 hover:shadow-amber-100' : 
                                        'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-indigo-50'
                                    }">
                                        <div class="flex justify-between items-center mb-3">
                                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                    <input type="checkbox" 
                                           id="rule_${rule.id}"
                                           ${rule.enabled ? 'checked' : ''}
                                           onchange="DailyManpowerManager.toggleRule('${rule.id}', this.checked)"
                                                       class="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 shrink-0">
                                                <label for="rule_${rule.id}" class="font-bold text-sm text-slate-700 line-clamp-1 cursor-pointer flex-1" title="${rule.name}">${rule.name}</label>
                                            </div>
                                            <div class="flex items-center gap-2 text-xs font-bold ${
                                                rule.finalStatus === 'red' ? 'text-red-600' : rule.finalStatus === 'yellow' ? 'text-amber-600' : 'text-emerald-600'
                                            }">
                                                <span>${rule.hasLogicError ? '逻辑矛盾' : (rule.finalStatus === 'green' ? '合规' : (rule.finalStatus === 'yellow' ? '上级规则冲突' : '规则违规'))}</span>
                                                <span class="ml-auto font-mono text-slate-400 bg-white/80 px-2 py-0.5 rounded text-[10px]">${rule.currentMin} ~ ${rule.currentMax}</span>
                                </div>
                                        </div>
                                        <div class="text-xs font-mono text-slate-600 bg-slate-50 p-2 rounded mb-3 break-all leading-relaxed border border-slate-100">
                                            ${rule.logicRaw || rule.expression || ''}
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
                                <div class="flex items-center gap-2">
                                    <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                        <span class="bg-emerald-100 text-emerald-700 w-6 h-6 flex items-center justify-center rounded text-xs font-mono">2</span>
                                        地点规则
                                    </h3>
                                    <span class="text-xs font-bold px-2 py-1 rounded-full ${groupStatus?.g3?.status === 'invalid' ? 'bg-red-100 text-red-700 border border-red-200' : groupStatus?.g3?.status === 'warning' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}">
                                        ${groupStatus?.g3?.text || '状态未知'}
                                    </span>
                </div>
                            </div>
                            <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${locationRules.length === 0 ? '<div class="text-slate-400 text-sm italic col-span-full py-4 text-center">暂无地点规则</div>' : ''}
                                ${locationRules.map(rule => `
                                    <div class="p-4 rounded-xl border-2 transition-all relative group shadow-sm ${
                                        rule.finalStatus === 'red' ? 'border-red-200 bg-red-50 hover:shadow-red-100' : 
                                        rule.finalStatus === 'yellow' ? 'border-amber-200 bg-amber-50 hover:shadow-amber-100' : 
                                        'border-slate-100 bg-white hover:border-emerald-200 hover:shadow-emerald-50'
                                    }">
                                        <div class="flex justify-between items-center mb-3">
                                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                                <input type="checkbox" 
                                                       id="rule_${rule.id}"
                                                       ${rule.enabled ? 'checked' : ''}
                                                       onchange="DailyManpowerManager.toggleRule('${rule.id}', this.checked)"
                                                       class="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 shrink-0">
                                                <label for="rule_${rule.id}" class="font-bold text-sm text-slate-700 line-clamp-1 cursor-pointer flex-1" title="${rule.name}">${rule.name}</label>
                                            </div>
                                            <div class="flex items-center gap-2 text-xs font-bold ${
                                                rule.finalStatus === 'red' ? 'text-red-600' : rule.finalStatus === 'yellow' ? 'text-amber-600' : 'text-emerald-600'
                                            }">
                                                <span>${rule.hasLogicError ? '逻辑矛盾' : (rule.finalStatus === 'green' ? '合规' : (rule.finalStatus === 'yellow' ? '上级规则冲突' : '规则违规'))}</span>
                                                <span class="ml-auto font-mono text-slate-400 bg-white/80 px-2 py-0.5 rounded text-[10px]">${rule.currentMin} ~ ${rule.currentMax}</span>
                                            </div>
                                        </div>
                                        <div class="text-xs font-mono text-slate-600 bg-slate-50 p-2 rounded mb-3 break-all leading-relaxed border border-slate-100">
                                            ${rule.logicRaw || rule.expression || ''}
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
            
            // 如果没有当前配置ID，尝试从Store中获取激活的配置ID
            if (!this.currentConfigId && typeof Store !== 'undefined') {
                const activeConfigId = Store.getState('activeDailyManpowerConfigId');
                if (activeConfigId) {
                    this.currentConfigId = activeConfigId;
                }
            }
            
            let config = await this.loadCurrentConfig();
            if (!config) {
                config = await this.createDefaultConfig();
                // 如果有激活的配置ID，使用它
                if (this.currentConfigId) {
                    config.configId = this.currentConfigId;
                }
            }
            
            // 从矩阵转换为旧格式
            const { baseFunctions, businessFunctions } = this.convertFromMatrix(this.matrix);
            
            config.baseFunctions = baseFunctions;
            // 如果业务职能配置存在，也更新
            if (businessFunctions) {
                config.businessFunctions = businessFunctions;
            }
            
            // 保存规则和变量
            config.rules = this.rules || [];
            config.customVars = this.customVars || [];
            config.groups = this.groups || [];
            
            // 保存矩阵数据
            config.matrix = this.matrix;
            
            config.updatedAt = new Date().toISOString();
            await this.saveConfig(config);
            
            // 刷新配置列表（如果当前在配置列表视图）
            if (this.currentView === 'configs') {
                await this.renderConfigList();
            }
            
            // 安全地调用状态更新
            if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                StatusUtils.updateStatus('基础职能配置已保存', 'success');
            } else if (typeof updateStatus === 'function') {
                updateStatus('基础职能配置已保存', 'success');
            }
            
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
            
            // 如果没有当前配置ID，尝试从Store中获取激活的配置ID
            if (!this.currentConfigId && typeof Store !== 'undefined') {
                const activeConfigId = Store.getState('activeDailyManpowerConfigId');
                if (activeConfigId) {
                    this.currentConfigId = activeConfigId;
                }
            }
            
            let config = await this.loadCurrentConfig();
            if (!config) {
                config = await this.createDefaultConfig();
                // 如果有激活的配置ID，使用它
                if (this.currentConfigId) {
                    config.configId = this.currentConfigId;
                }
            }
            
            // 从矩阵转换为旧格式
            const { baseFunctions, businessFunctions } = this.convertFromMatrix(this.matrix);
            
            config.businessFunctions = businessFunctions;
            // 如果基础职能配置存在，也更新
            if (baseFunctions) {
                config.baseFunctions = baseFunctions;
            }
            
            // 保存规则和变量
            config.rules = this.rules || [];
            config.customVars = this.customVars || [];
            config.groups = this.groups || [];
            
            // 保存矩阵数据
            config.matrix = this.matrix;
            
            config.updatedAt = new Date().toISOString();
            await this.saveConfig(config);
            
            // 刷新配置列表（如果当前在配置列表视图）
            if (this.currentView === 'configs') {
                await this.renderConfigList();
            }
            
            // 安全地调用状态更新
            if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                StatusUtils.updateStatus('业务职能配置已保存', 'success');
            } else if (typeof updateStatus === 'function') {
                updateStatus('业务职能配置已保存', 'success');
            }
            
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
            
            // 如果没有当前配置ID，尝试从Store中获取激活的配置ID
            if (!this.currentConfigId && typeof Store !== 'undefined') {
                const activeConfigId = Store.getState('activeDailyManpowerConfigId');
                if (activeConfigId) {
                    this.currentConfigId = activeConfigId;
                }
            }
            
            let config = await this.loadCurrentConfig();
            if (!config) {
                config = await this.createDefaultConfig();
                // 如果有激活的配置ID，使用它
                if (this.currentConfigId) {
                    config.configId = this.currentConfigId;
                }
            }
            
            config.complexRules = complexRules;
            config.updatedAt = new Date().toISOString();
            await this.saveConfig(config);
            
            // 刷新配置列表（如果当前在配置列表视图）
            if (this.currentView === 'configs') {
                await this.renderConfigList();
            }
            
            // 安全地调用状态更新
            if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                StatusUtils.updateStatus('复杂规则配置已保存', 'success');
            } else if (typeof updateStatus === 'function') {
                updateStatus('复杂规则配置已保存', 'success');
            }
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
        // 生成初始矩阵（包含所有默认约束）
        const matrix = this.generateInitialMatrix();
        
        // 生成默认规则
        const rules = this.generateDefaultRules();
        
        // 生成默认分组
        const groups = this.getDefaultGroups();
        
        // 从矩阵转换为旧格式（用于兼容）
        const { baseFunctions, businessFunctions } = this.convertFromMatrix(matrix);
        
        return {
            configId: 'default',
            name: '默认配置',
            baseFunctions: baseFunctions,
            businessFunctions: businessFunctions,
            complexRules: this.getDefaultComplexRules(),
            // 保存矩阵数据（新格式）
            matrix: matrix,
            // 保存规则和变量
            rules: rules,
            customVars: [],
            groups: groups,
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
     * 保存当前配置（包括规则和变量）
     */
    async saveCurrentConfig() {
        if (!this.currentConfigId) {
            // 如果没有当前配置ID，尝试获取激活的配置
            if (typeof Store !== 'undefined') {
                this.currentConfigId = Store.getState('activeDailyManpowerConfigId');
            }
            if (!this.currentConfigId) {
                console.warn('没有当前配置ID，无法保存');
                return;
            }
        }
        
        let config = await this.loadCurrentConfig();
        if (!config) {
            config = await this.createDefaultConfig();
            config.configId = this.currentConfigId;
        }
        
        // 保存规则和变量
        config.rules = this.rules || [];
        config.customVars = this.customVars || [];
        config.groups = this.groups || [];
        
        // 保存矩阵数据（同时保存矩阵和旧格式以兼容）
        config.matrix = this.matrix;
        const { baseFunctions, businessFunctions } = this.convertFromMatrix(this.matrix);
        config.baseFunctions = baseFunctions;
        config.businessFunctions = businessFunctions;
        
        await this.saveConfig(config);
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
        const showInputDialogFn = async (msg, def) => {
            if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.showInputDialog === 'function') {
                return await DialogUtils.showInputDialog(msg, def);
            } else if (typeof showInputDialog !== 'undefined') {
                return await showInputDialog(msg, def);
            } else {
                return prompt(msg, def);
            }
        };
        
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
        
        const updateStatusFn = (msg, type) => {
            if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                StatusUtils.updateStatus(msg, type);
            } else if (typeof updateStatus === 'function') {
                updateStatus(msg, type);
            } else {
                console.log(`[${type}] ${msg}`);
            }
        };
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
            const alertFn = (msg) => {
                if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(msg);
                } else {
                    alert(msg);
                }
            };
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
            
            const updateStatusFn = (msg, type) => {
                if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                    StatusUtils.updateStatus(msg, type);
                } else if (typeof updateStatus === 'function') {
                    updateStatus(msg, type);
                } else {
                    console.log(`[${type}] ${msg}`);
                }
            };
            updateStatusFn('配置已激活', 'success');
        } catch (error) {
            const alertFn = (msg) => {
                if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(msg);
                } else {
                    alert(msg);
                }
            };
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
            const alertFn = (msg) => {
                if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(msg);
                } else {
                    alert(msg);
                }
            };
            alertFn('配置不存在');
            return;
        }

        // 保存原始配置快照
        this.originalConfigSnapshot = JSON.parse(JSON.stringify(config));
        this.currentConfigId = configId;
        this.currentView = 'baseFunctions';
        
        // 加载配置到当前工作区
        await this.loadConfig(configId);
        
        // 加载配置数据
        if (config.matrix) {
            this.matrix = config.matrix;
        } else if (config.baseFunctions || config.businessFunctions) {
            this.matrix = this.convertToMatrix(config.baseFunctions, config.businessFunctions);
        } else {
            this.matrix = this.generateInitialMatrix();
        }
        
        if (config.rules) this.rules = config.rules;
        if (config.customVars) this.customVars = config.customVars;
        if (config.groups) this.groups = config.groups;
        
        // 显示全量人力配置矩阵
        await this.showBaseFunctionsConfig();
    },

    /**
     * 编辑配置名称
     * @param {string} configId - 配置ID
     */
    async editConfigName(configId) {
        const config = await this.loadConfigById(configId);
        if (!config) {
            const alertFn = (msg) => {
                if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(msg);
                } else {
                    alert(msg);
                }
            };
            alertFn('配置不存在');
            return;
        }

        // 使用自定义输入对话框
        const showInputDialogFn = async (msg, def) => {
            if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.showInputDialog === 'function') {
                return await DialogUtils.showInputDialog(msg, def);
            } else if (typeof showInputDialog !== 'undefined') {
                return await showInputDialog(msg, def);
            } else {
                return prompt(msg, def);
            }
        };
        
        const newName = await showInputDialogFn('请输入新的配置名称：', config.name);
        if (!newName || newName.trim() === '' || newName.trim() === config.name) {
            return;
        }

        try {
            config.name = newName.trim();
            config.updatedAt = new Date().toISOString();
            
            await this.saveConfig(config);
            await this.renderConfigList();
            
            const updateStatusFn = (msg, type) => {
                if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                    StatusUtils.updateStatus(msg, type);
                } else if (typeof updateStatus === 'function') {
                    updateStatus(msg, type);
                } else {
                    console.log(`[${type}] ${msg}`);
                }
            };
            updateStatusFn('配置名称已更新', 'success');
        } catch (error) {
            const alertFn = (msg) => {
                if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(msg);
                } else {
                    alert(msg);
                }
            };
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
                const updateStatusFn = (msg, type) => {
                if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                    StatusUtils.updateStatus(msg, type);
                } else if (typeof updateStatus === 'function') {
                    updateStatus(msg, type);
                } else {
                    console.log(`[${type}] ${msg}`);
                }
            };
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
                const updateStatusFn = (msg, type) => {
                if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                    StatusUtils.updateStatus(msg, type);
                } else if (typeof updateStatus === 'function') {
                    updateStatus(msg, type);
                } else {
                    console.log(`[${type}] ${msg}`);
                }
            };
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
            const alertFn = (msg) => {
                if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(msg);
                } else {
                    alert(msg);
                }
            };
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
            
            const updateStatusFn = (msg, type) => {
                if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                    StatusUtils.updateStatus(msg, type);
                } else if (typeof updateStatus === 'function') {
                    updateStatus(msg, type);
                } else {
                    console.log(`[${type}] ${msg}`);
                }
            };
            updateStatusFn('配置已复制（新配置为非激活状态）', 'success');
        } catch (error) {
            const alertFn = (msg) => {
                if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(msg);
                } else {
                    alert(msg);
                }
            };
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
            
            const updateStatusFn = (msg, type) => {
                if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                    StatusUtils.updateStatus(msg, type);
                } else if (typeof updateStatus === 'function') {
                    updateStatus(msg, type);
                } else {
                    console.log(`[${type}] ${msg}`);
                }
            };
            updateStatusFn('配置已删除', 'success');
        } catch (error) {
            alert('删除失败：' + error.message);
        }
    }
};

// 暴露到全局作用域
try {
    if (typeof window !== 'undefined') {
        window.DailyManpowerManager = DailyManpowerManager;
        console.log('DailyManpowerManager 已成功暴露到全局作用域');
    } else {
        console.warn('window 对象未定义，无法暴露 DailyManpowerManager');
    }
} catch (error) {
    console.error('暴露 DailyManpowerManager 到全局作用域时出错:', error);
    // 即使出错也尝试暴露
    if (typeof window !== 'undefined') {
        try {
            window.DailyManpowerManager = DailyManpowerManager;
        } catch (e) {
            console.error('无法暴露 DailyManpowerManager:', e);
        }
    }
}

