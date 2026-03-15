/**
 * 增量夜班排班求解器
 *
 * 从 scheduler-night.js 的 IncrementalScheduler 算法移植
 * 实现了 7 阶段渐进回溯策略的大夜排班算法
 *
 * 特性：
 * - 渐进式策略求解（7 阶段）
 * - 回溯搜索算法
 * - 生理期限制支持
 * - 休假冲突检测
 * - 连续天数约束
 * - 公平性权重分配
 *
 * @module IncrementalNightShiftSolver
 */

// 调试：确认脚本开始执行
console.log('[IncrementalNightShiftSolver] ========== 脚本开始加载 ==========');

// 添加全局错误捕获
window.addEventListener('error', function(e) {
    if (e.filename && e.filename.includes('incrementalNightShiftSolver.js')) {
        console.error('[IncrementalNightShiftSolver] 文件执行出错:', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            error: e.error
        });
    }
});

const IncrementalNightShiftSolver = {
    /**
     * 求解器配置
     */
    config: {
        maxStepsPerPhase: 100000  // 每阶段最大回溯次数
    },

    /**
     * 渐进式求解策略配置
     * 逐步放宽约束直到找到可行解
     */
    strategies: [
        [0.0, 0.0],   // 阶段 1：仅基础天数
        [0.3, 0.0],   // 阶段 2：30% 人员可 +1 天
        [0.6, 0.0],   // 阶段 3：60% 人员可 +1 天
        [1.0, 0.0],   // 阶段 4：100% 人员可 +1 天
        [1.0, 0.3],   // 阶段 5：30% 人员可 +2 天
        [1.0, 0.6],   // 阶段 6：60% 人员可 +2 天
        [1.0, 1.0]    // 阶段 7：100% 人员可 +2 天
    ],

    /**
     * 主求解方法
     * @param {Object} params - 求解参数
     * @param {Array} params.staffData - 人员数据列表
     * @param {Object} params.scheduleConfig - 排班配置 { startDate, endDate, year, month }
     * @param {Object} params.personalRequests - 个性化休假需求 { "staffId": { "YYYY-MM-DD": "REQ", ... } }
     * @param {Object} params.restDays - 法定休息日配置 { "YYYY-MM-DD": true/false }
     * @param {Object} params.configRules - NightShiftConfigRules 配置
     * @returns {Object} 排班结果 { schedule, mandatoryRestDays, stats }
     */
    async solve(params) {
        const { staffData, scheduleConfig, personalRequests = {}, restDays = {}, configRules } = params;

        console.log('[IncrementalNightShiftSolver] 开始渐进式求解...');
        console.log(`  排班周期: ${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}`);
        console.log(`  人员数量: ${staffData.length}`);

        // 创建调度器实例
        const scheduler = new IncrementalScheduler({
            staffData,
            scheduleConfig,
            personalRequests,
            restDays,
            configRules,
            solverConfig: this.config
        });

        // 执行渐进式求解
        const success = scheduler.solveIncremental();

        if (!success) {
            console.warn('[IncrementalNightShiftSolver] 无法在当前约束下找到解');
            return {
                schedule: {},
                mandatoryRestDays: {},
                stats: {
                    totalNightShifts: 0,
                    staffNightShiftCounts: {},
                    warnings: ['无法在当前约束下找到可行排班方案'],
                    errors: []
                }
            };
        }

        // 转换为标准输出格式
        return scheduler.getResult();
    }
};

/**
 * 增量调度器类
 * 核心排班算法实现
 */
class IncrementalScheduler {
    /**
     * @param {Object} options - 初始化参数
     */
    constructor(options) {
        const { staffData, scheduleConfig, personalRequests, restDays, configRules, solverConfig } = options;

        this.staffData = staffData;
        this.scheduleConfig = scheduleConfig;
        this.personalRequests = personalRequests;
        this.restDays = restDays;
        this.configRules = configRules || NightShiftConfigRules.getConfig();
        this.solverConfig = solverConfig || IncrementalNightShiftSolver.config;

        // 解析排班周期
        this.startDate = new Date(scheduleConfig.startDate);
        this.endDate = new Date(scheduleConfig.endDate);
        this.totalDays = Math.round((this.endDate - this.startDate) / (1000 * 60 * 60 * 24)) + 1;

        // 获取地区配置
        const regionConfig = this.configRules.regions?.shanghai || {};
        this.dailyMin = regionConfig.dailyMin || 1;
        this.dailyMax = regionConfig.dailyMax || 2;
        this.maleConsecutiveDays = regionConfig.maleConsecutiveDays || 4;
        this.femaleConsecutiveDays = regionConfig.femaleConsecutiveDays || 3;
        this.maleMaxDaysPerMonth = regionConfig.maleMaxDaysPerMonth || 4;
        this.femaleMaxDaysPerMonth = regionConfig.femaleMaxDaysPerMonth || 3;

        // 调度状态
        this.staffPool = [];           // 人员池（必须初始化）
        this.schedule = [];           // 按日期的排班结果
        this.assignedIds = new Set(); // 已分配的人员 ID
        this.steps = 0;               // 回溯次数
        this.allBlocks = [];          // 所有可用的排班块

        // 初始化人员池
        this.initStaff();
    }

    /**
     * 获取日期在周期中的索引
     * @param {string} dateStr - 日期字符串
     * @returns {number} 索引（0 开始）
     */
    getDateIndex(dateStr) {
        const dt = new Date(dateStr);
        const diffTime = dt - this.startDate;
        return Math.round(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * 初始化人员池
     * 处理人员数据、请假信息、生理期限制
     */
    initStaff() {
        console.log('[IncrementalScheduler] 初始化人员池...');

        // 1. 构建请假映射 { staffId: Set<dayIndex> }
        const leaveMap = new Map();
        for (const [staffId, requests] of Object.entries(this.personalRequests)) {
            const unavailableDays = new Set();
            for (const [dateStr, requestType] of Object.entries(requests)) {
                // 跳过空值和 NIGHT（夜班不算请假）
                if (!requestType || requestType === 'NIGHT') continue;
                
                const dayIndex = this.getDateIndex(dateStr);
                if (dayIndex >= 0 && dayIndex < this.totalDays) {
                    unavailableDays.add(dayIndex);
                }
            }
            if (unavailableDays.size > 0) {
                leaveMap.set(staffId, unavailableDays);
            }
        }

        // 2. 处理人员数据
        const half = Math.ceil(this.totalDays / 2); // 下半月起始索引

        for (const staff of this.staffData) {
            const staffId = staff.id || staff.staffId;

            // 检查基础资格（是否可排夜班）
            if (staff.canNightShift === false || staff.canNight === '否' || staff.nightShiftAllowed === false) {
                console.log(`[IncrementalScheduler] 跳过 ${staff.name}: 标记为不可排夜班`);
                continue;
            }

            // 排除哺乳期和孕妇
            if (staff.isLactating || staff.lactating || staff.isPregnant || staff.pregnant) {
                console.log(`[IncrementalScheduler] 跳过 ${staff.name}: 哺乳期/孕妇`);
                continue;
            }

            // 获取性别
            const gender = staff.gender === '女' || staff.gender === 'F' ? '女' : '男';

            // 获取基础连续天数
            const baseDur = gender === '女' ? this.femaleConsecutiveDays : this.maleConsecutiveDays;

            // 构建不可用日期集合
            const unavail = new Set();

            // 2.1 添加请假日期
            if (leaveMap.has(staffId)) {
                leaveMap.get(staffId).forEach(day => unavail.add(day));
            }

            // 2.2 处理生理期限制
            const menstrualPeriod = staff.menstrualPeriod || staff.menstrualPeriodType;
            let isUrgentEarly = false; // 是否需要尽早排班（上半月必须排完）

            if (menstrualPeriod) {
                if (menstrualPeriod === '下' || menstrualPeriod === 'lower' || menstrualPeriod === 'second') {
                    // 下半月有生理期，只排上半月
                    for (let d = half; d < this.totalDays; d++) {
                        unavail.add(d);
                    }
                    isUrgentEarly = true;
                    console.log(`[IncrementalScheduler] ${staff.name}: 生理期在下半月，需上半月完成`);
                } else if (menstrualPeriod === '上' || menstrualPeriod === 'upper' || menstrualPeriod === 'first') {
                    // 上半月有生理期，只排下半月
                    for (let d = 0; d < half; d++) {
                        unavail.add(d);
                    }
                    console.log(`[IncrementalScheduler] ${staff.name}: 生理期在上半月，需下半月完成`);
                }
            }

            // 2.3 计算上月夜班天数作为优先级权重
            const lastMonthDays = this.getLastMonthNightShiftDays(staff);
            const score = 100 - (lastMonthDays * 10); // 上月越少，分数越高

            // 添加到人员池
            this.staffPool.push({
                id: staffId,
                name: staff.name,
                gender: gender,
                score: score,
                baseDur: baseDur,
                unavail: unavail,
                isUrgentEarly: isUrgentEarly,
                lastMonthDays: lastMonthDays,
                staff: staff  // 保留完整人员信息
            });
        }

        // 3. 按分数降序排序（上月少的优先）
        this.staffPool.sort((a, b) => b.score - a.score);

        console.log(`[IncrementalScheduler] 人员池初始化完成: ${this.staffPool.length} 人`);
    }

    /**
     * 获取上月夜班天数
     * @param {Object} staff - 人员对象
     * @returns {number} 上月夜班天数
     */
    getLastMonthNightShiftDays(staff) {
        // 1. 优先从人员数据字段读取
        if (staff.lastMonthNightShiftDays !== undefined) {
            return staff.lastMonthNightShiftDays;
        }
        if (staff.lastMonthNightShifts !== undefined) {
            return staff.lastMonthNightShifts;
        }

        // 2. 尝试从历史排班结果读取
        const lastMonthResult = this.loadLastMonthScheduleResult();
        if (lastMonthResult && lastMonthResult.schedule) {
            const staffId = staff.id || staff.staffId;
            const staffSchedule = lastMonthResult.schedule[staffId];
            if (staffSchedule) {
                return Object.values(staffSchedule).filter(s => s === 'NIGHT').length;
            }
        }

        return 0; // 默认 0 天
    }

    /**
     * 加载上月排班结果
     * @returns {Object|null} 上月排班结果
     */
    loadLastMonthScheduleResult() {
        if (typeof Store === 'undefined') return null;

        const currentDate = new Date(this.scheduleConfig.startDate);
        currentDate.setMonth(currentDate.getMonth() - 1);
        const lastYear = currentDate.getFullYear();
        const lastMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
        const lastYearMonth = `${lastYear}${lastMonth}`;

        const resultConfigs = Store.getScheduleResultConfigs();
        const lastMonthConfig = resultConfigs.find(config => {
            return config.name && config.name.includes(lastYearMonth);
        });

        if (lastMonthConfig && lastMonthConfig.scheduleResultSnapshot) {
            console.log(`[上月数据] 从历史配置加载: ${lastMonthConfig.name}`);
            return lastMonthConfig.scheduleResultSnapshot;
        }

        return null;
    }

    /**
     * 根据策略生成排班块
     * @param {number} p1Ratio - 第一阶段放宽比例（可 +1 天的人员比例）
     * @param {number} p2Ratio - 第二阶段放宽比例（可 +2 天的人员比例）
     * @returns {Array} 排班块数组
     */
    generateBlocksForStrategy(p1Ratio, p2Ratio) {
        const count = this.staffPool.length;
        const limitP1 = Math.floor(count * p1Ratio);
        const limitP2 = Math.floor(count * p2Ratio);

        const allowedP1 = new Set(this.staffPool.slice(0, limitP1).map(s => s.id));
        const allowedP2 = new Set(this.staffPool.slice(0, limitP2).map(s => s.id));

        const blocks = [];

        for (const staff of this.staffPool) {
            // 基础连续天数
            const durs = [staff.baseDur];

            // 根据策略放宽天数
            if (allowedP1.has(staff.id)) durs.push(staff.baseDur + 1);
            if (allowedP2.has(staff.id)) durs.push(staff.baseDur + 2);

            // 去重
            const uniqueDurs = [...new Set(durs)];

            // 生成所有可能的连续排班块
            for (const len of uniqueDurs) {
                for (let start = 0; start <= this.totalDays - len; start++) {
                    const days = [];
                    let valid = true;

                    // 检查块内的日期是否都可用
                    for (let k = 0; k < len; k++) {
                        const d = start + k;
                        if (staff.unavail.has(d)) {
                            valid = false;
                            break;
                        }
                        days.push(d);
                    }

                    if (valid) {
                        blocks.push({
                            staffId: staff.id,
                            name: staff.name,
                            gender: staff.gender,
                            days: days,
                            score: staff.score,
                            length: len,
                            isUrgentEarly: staff.isUrgentEarly,
                            staff: staff
                        });
                    }
                }
            }
        }

        console.log(`[IncrementalScheduler] 策略 [${p1Ratio}, ${p2Ratio}]: 生成 ${blocks.length} 个排班块`);
        return blocks;
    }

    /**
     * 回溯搜索算法
     * @param {number} dayIndex - 当前日期索引
     * @returns {boolean} 是否找到可行解
     */
    backtrack(dayIndex) {
        this.steps++;

        // 达到最大回溯次数限制
        if (this.steps > this.solverConfig.maxStepsPerPhase) {
            return false;
        }

        // 所有日期处理完毕
        if (dayIndex >= this.totalDays) {
            return true;
        }

        // 如果当日已满足最小人数要求，尝试跳过到下一天
        if (this.schedule[dayIndex].length >= this.dailyMin) {
            if (this.backtrack(dayIndex + 1)) return true;
        }

        // 如果当日已达到最大人数限制，无法继续在该日分配
        if (this.schedule[dayIndex].length >= this.dailyMax) {
            return false;
        }

        // 找到可用的候选排班块
        const candidates = this.allBlocks.filter(b => 
            b.days.includes(dayIndex) && 
            !this.assignedIds.has(b.staffId)
        );

        // 排序候选块（优先级策略）
        candidates.sort((a, b) => {
            // 策略 1：上半月优先处理需要尽早完成的人员
            if (dayIndex < 15) {
                const aU = a.isUrgentEarly ? 0 : 1;
                const bU = b.isUrgentEarly ? 0 : 1;
                if (aU !== bU) return aU - bU;
            }

            // 策略 2：优先短块（减少资源占用）
            if (a.length !== b.length) return a.length - b.length;

            // 策略 3：优先高分（上月少的）
            if (a.score !== b.score) return b.score - a.score;

            // 策略 4：随机打破僵局
            return Math.random() - 0.5;
        });

        // 尝试每个候选块
        for (const block of candidates) {
            // 检查是否有日期超出每日最大人数
            let conflict = false;
            for (const d of block.days) {
                if (this.schedule[d].length >= this.dailyMax) {
                    conflict = true;
                    break;
                }
            }
            if (conflict) continue;

            // 分配该块
            block.days.forEach(d => this.schedule[d].push(block.name));
            this.assignedIds.add(block.staffId);

            // 递归处理下一天
            if (this.backtrack(dayIndex)) return true;

            // 回滚
            this.assignedIds.delete(block.staffId);
            block.days.forEach(d => this.schedule[d].pop());
        }

        return false;
    }

    /**
     * 渐进式求解主入口
     * 逐步放宽约束直到找到可行解
     * @returns {boolean} 是否找到可行解
     */
    solveIncremental() {
        console.log(`[IncrementalScheduler] 开始渐进式求解...`);
        console.log(`  目标时段: ${this.scheduleConfig.startDate} 至 ${this.scheduleConfig.endDate} (${this.totalDays}天)`);
        console.log(`  每日需求: ${this.dailyMin}-${this.dailyMax} 人`);
        console.log(`  人员池: ${this.staffPool.length} 人`);
        console.time('执行耗时');

        for (let idx = 0; idx < IncrementalNightShiftSolver.strategies.length; idx++) {
            const [r1, r2] = IncrementalNightShiftSolver.strategies[idx];

            console.log(`\n[IncrementalScheduler] === 策略阶段 ${idx + 1}/${IncrementalNightShiftSolver.strategies.length} [${r1}, ${r2}] ===`);

            // 重置状态
            this.allBlocks = this.generateBlocksForStrategy(r1, r2);
            this.schedule = Array.from({ length: this.totalDays }, () => []);
            this.assignedIds = new Set();
            this.steps = 0;

            // 执行回溯搜索
            const success = this.backtrack(0);
            
            // 打印当前状态
            const filledDays = this.schedule.filter(day => day.length > 0).length;
            const totalPeople = this.schedule.reduce((sum, day) => sum + day.length, 0);
            console.log(`  回溯次数: ${this.steps}, 成功: ${success}, 已填充天数: ${filledDays}/${this.totalDays}, 总人数: ${totalPeople}`);

            if (success) {
                console.log(`\n[成功] 策略阶段 ${idx + 1} 成功排产！`);
                console.timeEnd('执行耗时');
                this.printResult();
                return true;
            }
        }

        console.log('\n[失败] 所有策略阶段均未找到可行解');
        console.timeEnd('执行耗时');
        return false;
    }

    /**
     * 打印排班结果
     */
    printResult() {
        const table = this.schedule.map((names, i) => {
            const d = new Date(this.startDate);
            d.setDate(d.getDate() + i);
            return {
                '日期': d.toISOString().slice(0, 10),
                '人数': names.length,
                '名单': names.join(', ')
            };
        });
        console.table(table);
    }

    /**
     * 获取求解结果（转换为标准格式）
     * @returns {Object} { schedule, mandatoryRestDays, stats }
     */
    getResult() {
        const schedule = {};          // { staffId: { dateStr: 'NIGHT' } }
        const mandatoryRestDays = {}; // { staffId: [dateStr, ...] }
        const staffNightShiftCounts = {};

        // 转换格式
        for (const [dateStr, names] of this.schedule.entries()) {
            for (const name of names) {
                // 找到对应的员工信息
                const staffInfo = this.staffPool.find(s => s.name === name);
                if (!staffInfo) continue;

                const staffId = staffInfo.id;

                // 添加到排班表
                if (!schedule[staffId]) {
                    schedule[staffId] = {};
                }
                schedule[staffId][dateStr] = 'NIGHT';

                // 统计
                staffNightShiftCounts[staffId] = (staffNightShiftCounts[staffId] || 0) + 1;

                // 添加夜班后的强制休息日
                if (!mandatoryRestDays[staffId]) {
                    mandatoryRestDays[staffId] = [];
                }
                this.addMandatoryRestDays(mandatoryRestDays[staffId], dateStr);
            }
        }

        // 计算总夜班数
        const totalNightShifts = Object.values(staffNightShiftCounts).reduce((sum, count) => sum + count, 0);

        // 生成统计信息
        const stats = {
            totalNightShifts: totalNightShifts,
            staffNightShiftCounts: staffNightShiftCounts,
            dateCounts: this.getDateCounts(),
            warnings: [],
            errors: []
        };

        // 验证结果
        const validation = this.validateResult();
        stats.warnings = validation.warnings;
        stats.errors = validation.errors;

        console.log('[IncrementalNightShiftSolver] 求解完成');
        console.log(`  总夜班数: ${totalNightShifts}`);
        console.log(`  参与人数: ${Object.keys(schedule).length}`);

        return {
            schedule: schedule,
            mandatoryRestDays: mandatoryRestDays,
            stats: stats
        };
    }

    /**
     * 获取每日夜班统计
     * @returns {Object} { dateStr: count }
     */
    getDateCounts() {
        const dateCounts = {};
        for (let i = 0; i < this.totalDays; i++) {
            const d = new Date(this.startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().slice(0, 10);
            dateCounts[dateStr] = this.schedule[i].length;
        }
        return dateCounts;
    }

    /**
     * 添加夜班后的强制休息日
     * @param {Array} restDays - 休息日列表
     * @param {string} nightDateStr - 夜班日期
     */
    addMandatoryRestDays(restDays, nightDateStr) {
        const postShiftRestDays = this.configRules.strictContinuous?.postShiftRestDays || 2;
        const nightIndex = this.getDateIndex(nightDateStr);

        for (let i = 1; i <= postShiftRestDays; i++) {
            const nextIndex = nightIndex + i;
            if (nextIndex < this.totalDays) {
                const d = new Date(this.startDate);
                d.setDate(d.getDate() + nextIndex);
                const dateStr = d.toISOString().slice(0, 10);
                if (!restDays.includes(dateStr)) {
                    restDays.push(dateStr);
                }
            }
        }
    }

    /**
     * 验证排班结果
     * @returns {Object} { errors: [], warnings: [] }
     */
    validateResult() {
        const errors = [];
        const warnings = [];

        // 1. 检查每日人数是否满足最小值
        for (let i = 0; i < this.totalDays; i++) {
            const count = this.schedule[i].length;
            if (count < this.dailyMin) {
                const d = new Date(this.startDate);
                d.setDate(d.getDate() + i);
                const dateStr = d.toISOString().slice(0, 10);
                errors.push(`${dateStr} 只有 ${count} 人，低于最小要求 ${this.dailyMin} 人`);
            }
            if (count > this.dailyMax) {
                const d = new Date(this.startDate);
                d.setDate(d.getDate() + i);
                const dateStr = d.toISOString().slice(0, 10);
                warnings.push(`${dateStr} 有 ${count} 人，超过最大限制 ${this.dailyMax} 人`);
            }
        }

        // 2. 检查月度硬上限
        const staffDateMap = {};
        for (let i = 0; i < this.totalDays; i++) {
            for (const name of this.schedule[i]) {
                const staffInfo = this.staffPool.find(s => s.name === name);
                if (!staffInfo) continue;

                const staffId = staffInfo.id;
                if (!staffDateMap[staffId]) {
                    staffDateMap[staffId] = {
                        dates: [],
                        gender: staffInfo.gender,
                        name: staffInfo.name
                    };
                }
                const d = new Date(this.startDate);
                d.setDate(d.getDate() + i);
                staffDateMap[staffId].dates.push(d.toISOString().slice(0, 10));
            }
        }

        for (const [staffId, data] of Object.entries(staffDateMap)) {
            const maxDays = data.gender === '女' ? this.femaleMaxDaysPerMonth : this.maleMaxDaysPerMonth;
            if (data.dates.length > maxDays) {
                errors.push(`${data.name} 分配了 ${data.dates.length} 天，超过月度硬上限 ${maxDays} 天`);
            }
        }

        console.log('[IncrementalScheduler] 验证结果:', errors.length === 0 ? '通过' : `${errors.length} 个错误`);
        return { errors, warnings };
    }
}

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.IncrementalNightShiftSolver = IncrementalNightShiftSolver;
    console.log('[IncrementalNightShiftSolver] 已暴露到全局作用域');
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IncrementalNightShiftSolver, IncrementalScheduler };
}
