/**
 * 大夜管理和配置模块
 *
 * 负责大夜排班的完整生命周期管理：
 * - 配置管理
 * - 人力富裕程度计算
 * - 个人拍夜班检查
 * - 大夜排班生成
 * - 结果展示和应用
 *
 * ============================================================
 * 约束类型说明：
 * - 【硬约束】（不可违反）：硬上限、每日人数、休假冲突、生理期限制
 * - 【软约束】（尽量满足）：目标天数、连续天数、公平性策略
 * ============================================================
 *
 * ============================================================
 * 排班结果格式说明：
 * - manager 格式: { dateStr: [{ staffId, name, gender, ... }] }
 * - solver 格式: { staffId: { dateStr: 'NIGHT' } }
 * 提供了格式转换方法确保输出格式统一
 * ============================================================
 *
 * @module NightShiftManager
 */

const NightShiftManager = {
    /**
     * 当前大夜排班结果
     */
    currentSchedule: null,

    /**
     * 当前人力分析结果
     */
    currentManpowerAnalysis: null,

    /**
     * 当前视图：'configs' 或 'configEntry'
     */
    currentView: 'configs',

    /**
     * 当前配置ID
     */
    currentConfigId: null,

    /**
     * 初始化管理器
     */
    async init() {
        try {
            console.log('[NightShiftManager] 初始化大夜管理器');

            // 初始化配置规则
            await NightShiftConfigRules.init();

            return true;
        } catch (error) {
            console.error('[NightShiftManager] 初始化失败:', error);
            throw error;
        }
    },

    // ==================== A. 人力富裕程度计算 ====================

    /**
     * 计算地区人力富裕程度
     * @param {string} regionKey - 地区代码 ('shanghai')
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} 人力分析结果
     */
    async calculateManpowerSufficiency(regionKey, dateRange) {
        console.log(`[NightShiftManager] 计算 ${regionKey} 地区人力富裕程度`);

        try {
            // 【修改】从 DailyManpowerManager 获取配置
            let dailyMax = 2; // 默认值
            let dailyMin = 1; // 默认值
            
            if (typeof DailyManpowerManager !== 'undefined' && DailyManpowerManager.matrix) {
                // 尝试从 DailyManpowerManager 矩阵中获取大夜配置
                // 可能的键：'大夜_SH_common', '大夜_上海', '大夜_SH'
                const nightShiftKeys = ['大夜_SH_common', '大夜_上海', '大夜_SH'];
                for (const key of nightShiftKeys) {
                    const cell = DailyManpowerManager.matrix[key];
                    if (cell) {
                        if (typeof cell.max === 'number') {
                            dailyMax = cell.max;
                        }
                        if (typeof cell.min === 'number') {
                            dailyMin = cell.min;
                        }
                        console.log(`  - 从 DailyManpowerManager 获取大夜配置: ${key}, min=${dailyMin}, max=${dailyMax}`);
                        break;
                    }
                }
                
                // 如果没找到，尝试从激活的配置中加载（异步）
                if (dailyMax === 2 && typeof Store !== 'undefined' && Store.state && Store.state.activeDailyManpowerConfigId) {
                    const activeId = Store.state.activeDailyManpowerConfigId;
                    if (typeof DB !== 'undefined' && typeof DB.loadDailyManpowerConfig === 'function') {
                        try {
                            const config = await DB.loadDailyManpowerConfig(activeId);
                            if (config && config.matrix) {
                                for (const key of nightShiftKeys) {
                                    const cell = config.matrix[key];
                                    if (cell) {
                                        if (typeof cell.max === 'number') {
                                            dailyMax = cell.max;
                                        }
                                        if (typeof cell.min === 'number') {
                                            dailyMin = cell.min;
                                        }
                                        console.log(`  - 从数据库配置获取大夜配置: ${key}, min=${dailyMin}, max=${dailyMax}`);
                                        break;
                                    }
                                }
                            }
                        } catch (error) {
                            console.warn('  - 读取每日人力配置失败:', error);
                        }
                    }
                }
            }
            
            // 如果仍然没有找到，使用 NightShiftConfigRules 作为后备
            if (dailyMax === 2) {
                const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
                dailyMax = regionConfig.dailyMax || 2;
                dailyMin = regionConfig.dailyMin || 1;
                console.log(`  - 使用 NightShiftConfigRules 后备配置: min=${dailyMin}, max=${dailyMax}`);
            }

            // 获取人力计算配置（仍从 NightShiftConfigRules 获取，因为这些是业务规则）
            const manpowerConfig = NightShiftConfigRules.getManpowerCalculationConfig();

            // 获取该地区所有员工
            const allStaff = this.getStaffByRegion(regionKey);

            // 分离男女员工
            const males = allStaff.filter(s => s.gender === '男' && this.canDoNightShift(s));
            const females = allStaff.filter(s => s.gender === '女' && this.canDoNightShift(s));

            console.log(`  - 可排大夜的男生: ${males.length}人`);
            console.log(`  - 可排大夜的女生: ${females.length}人`);

            // 计算总需求人天数（使用从 DailyManpowerManager 获取的 dailyMax）
            const days = this.getDaysInRange(dateRange);
            const totalDemand = days * dailyMax;

            const constraints = NightShiftConfigRules.getConstraintsConfig();

            // 计算总供给人天数（使用人力配置中的标准天数）
            const baseMaleDays = manpowerConfig.maleDaysPerMonth;
            const baseFemaleDays = manpowerConfig.femaleDaysPerMonth;
            let reduceMaleIds = [];
            let reduceCount = 0;
            let maleSupply = males.length * baseMaleDays;

            if (constraints.allowMaleReduceTo3Days) {
                // 人力富足时，仅部分男生从4天降为3天（按富裕人天数确定人数）
                const potentialSurplus = maleSupply + females.length * baseFemaleDays - totalDemand;
                if (potentialSurplus > manpowerConfig.richThreshold) {
                    reduceCount = Math.min(males.length, Math.floor(potentialSurplus));
                    if (reduceCount > 0) {
                        const sortedMales = [...males].sort((a, b) => {
                            const aScore = a.priorityScore || a.score || 0;
                            const bScore = b.priorityScore || b.score || 0;
                            if (aScore !== bScore) {
                                return bScore - aScore; // 积分高的优先减少
                            }
                            return String(this.getStaffId(a)).localeCompare(String(this.getStaffId(b)), undefined, { numeric: true });
                        });
                        reduceMaleIds = sortedMales.slice(0, reduceCount).map(s => this.getStaffId(s));
                    }
                }
            }

            if (reduceCount > 0) {
                const reducedMaleDays = Math.min(baseMaleDays, 3);
                maleSupply = (males.length - reduceCount) * baseMaleDays + reduceCount * reducedMaleDays;
            }

            const femaleSupply = females.length * baseFemaleDays;
            const totalSupply = maleSupply + femaleSupply;

            // 判断人力状态
            const surplus = totalSupply - totalDemand;
            const isSufficient = surplus >= 0;

            // 确定调整策略
            let adjustmentStrategy = 'normal';
            let adjustmentAmount = 0;

            if (isSufficient && surplus > manpowerConfig.richThreshold) {
                // 人力富足，部分男生可以减少天数（4天→3天）
                adjustmentStrategy = 'reduce';
                adjustmentAmount = surplus;
            } else if (!isSufficient) {
                // 人力不足，某些男生需要增加天数（4天→5天）
                adjustmentStrategy = 'increase';
                adjustmentAmount = Math.abs(surplus);
            }

            // 获取地区显示名称
            const regionDisplayName = regionKey === 'shanghai' ? '上海' : regionKey;
            
            const result = {
                region: regionDisplayName,
                regionKey: regionKey,
                totalMales: males.length,
                totalFemales: females.length,
                maleSupply,
                femaleSupply,
                totalSupply,
                totalDemand,
                days,
                dailyMin: dailyMin,  // 添加每日最小需求
                dailyMax: dailyMax,  // 添加每日最大需求
                surplus,
                isSufficient,
                adjustmentStrategy,
                adjustmentAmount,
                reduceMaleIds,
                reduceCount
            };

            console.log(`  - 总供给: ${totalSupply}人天`);
            console.log(`  - 总需求: ${totalDemand}人天`);
            console.log(`  - 富裕/不足: ${surplus}人天`);
            console.log(`  - 调整策略: ${adjustmentStrategy}`);

            return result;
        } catch (error) {
            console.error(`[NightShiftManager] 计算 ${regionKey} 地区人力失败:`, error);
            throw error;
        }
    },

    /**
     * 计算所有地区的人力富裕程度
     * @param {Object} dateRange - 日期范围
     * @returns {Object} 所有地区的人力分析结果
     */
    async calculateAllManpowerSufficiency(dateRange) {
        console.log('[NightShiftManager] 计算所有地区人力富裕程度');

        const results = {
            shanghai: await this.calculateManpowerSufficiency('shanghai', dateRange),
            timestamp: new Date().toISOString()
        };

        // 保存到实例变量
        this.currentManpowerAnalysis = results;

        return results;
    },

    /**
     * 获取员工的大夜目标天数与硬上限（结合人力策略）
     * @param {Object} staff - 员工对象
     * @param {string} regionKey - 地区代码
     * @param {Object|null} manpowerInfo - 人力分析结果（可选）
     * @returns {Object} { targetDays, maxDays, consecutiveDays }
     */
    getEffectiveNightShiftLimits(staff, regionKey, manpowerInfo = null) {
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
        const constraints = NightShiftConfigRules.getConstraintsConfig();

        let maxDays = staff.gender === '女'
            ? regionConfig.femaleMaxDaysPerMonth
            : regionConfig.maleMaxDaysPerMonth;
        let consecutiveDays = staff.gender === '女'
            ? regionConfig.femaleConsecutiveDays
            : regionConfig.maleConsecutiveDays;
        let targetDays = consecutiveDays;

        if (staff.gender === '男' && manpowerInfo) {
            const reducedSet = new Set(manpowerInfo.reduceMaleIds || []);
            if (manpowerInfo.adjustmentStrategy === 'reduce' && constraints.allowMaleReduceTo3Days && reducedSet.has(this.getStaffId(staff))) {
                // 人力富足：仅部分男生目标缩减为3天
                targetDays = 3;
                consecutiveDays = 3;
            } else if (manpowerInfo.adjustmentStrategy === 'increase' && constraints.allowMaleIncreaseTo5Days) {
                // 人力不足：男生目标提升为5天（需要同步调整硬上限）
                targetDays = 5;
                consecutiveDays = 5;
                maxDays = Math.max(maxDays, 5);
            }
        }

        return { targetDays, maxDays, consecutiveDays };
    },

    // ==================== B. 个人拍夜班检查逻辑 ====================

    /**
     * 检查个人是否可以在指定日期拍夜班
     * @param {Object} staff - 员工对象
     * @param {string} date - 日期字符串 (YYYY-MM-DD)
     * @param {string} regionKey - 地区代码
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} { eligible: boolean, reason: string, details: object }
     */
    checkEligibility(staff, date, regionKey, dateRange = null, manpowerInfo = null) {
        const config = NightShiftConfigRules.getConstraintsConfig();

        // 1. 检查基础条件
        if (config.checkBasicEligibility) {
            const basicCheck = this.checkBasicEligibility(staff);
            if (!basicCheck.eligible) {
                return {
                    eligible: false,
                    reason: 'not_eligible',
                    message: '不符合排夜班基础条件',
                    details: basicCheck
                };
            }
        }

        // 2. 检查生理期（女生）
        if (staff.gender === '女' && config.checkMenstrualPeriod) {
            const menstrualCheck = this.checkMenstrualPeriod(staff, date);
            if (menstrualCheck.isInPeriod) {
                return {
                    eligible: false,
                    reason: 'menstrual_period',
                    message: `处于${menstrualCheck.periodName || menstrualCheck.period}生理期，不能排夜班`,
                    details: menstrualCheck
                };
            }
        }

        // 3. 检查休假冲突
        if (config.checkVacationConflict) {
            // 需求变更：休假后不再设置缓冲期，仅禁止休假当天排夜班
            const bufferDays = 0;
            const vacationCheck = this.checkVacationConflict(staff, date, bufferDays);
            if (vacationCheck.hasConflict) {
                return {
                    eligible: false,
                    reason: 'vacation_conflict',
                    message: `休假后${bufferDays}天内不能作为夜班起点`,
                    details: vacationCheck
                };
            }
        }

        // 4. 检查是否可以作为连续大夜的起点
        const limits = this.getEffectiveNightShiftLimits(staff, regionKey, manpowerInfo);
        let consecutiveDays = limits.consecutiveDays;

        // 4.1 检查排班周期结尾约束（如果提供了dateRange）
        // 【P1-1修复】在周期末尾时，允许调整连续天数
        if (dateRange) {
            const periodEndCheck = this.checkPeriodEndConstraint(date, consecutiveDays, dateRange);
            if (!periodEndCheck.canStart) {
                return {
                    eligible: false,
                    reason: 'period_end_constraint',
                    message: periodEndCheck.message,
                    details: periodEndCheck
                };
            }
            // 使用调整后的连续天数
            consecutiveDays = periodEndCheck.adjustedDays || consecutiveDays;
        }

        const canStart = this.canStartConsecutivePeriod(staff, date, consecutiveDays, regionKey);
        if (!canStart.canStart) {
            return {
                eligible: false,
                reason: 'cannot_start_period',
                message: '无法开始连续夜班周期',
                details: canStart
            };
        }

        // 所有检查通过
        return {
            eligible: true,
            reason: 'eligible',
            message: '可以排夜班',
            details: { consecutiveDays }
        };
    },

    /**
     * 检查基础条件
     * @param {Object} staff - 员工对象
     * @returns {Object} { eligible: boolean, reason: string }
     */
    checkBasicEligibility(staff) {
        // 检查是否标记为可排夜班
        if (!this.canDoNightShift(staff)) {
            return {
                eligible: false,
                reason: 'not_marked_for_night_shift'
            };
        }

        // 检查特殊状态（孕妇、哺乳期等）
        const isPregnant = staff.isPregnant || staff.pregnant;
        const isLactating = staff.isLactating || staff.lactating;

        if (isPregnant) {
            return {
                eligible: false,
                reason: 'pregnant'
            };
        }

        if (isLactating) {
            return {
                eligible: false,
                reason: 'lactating'
            };
        }

        return {
            eligible: true
        };
    },

    /**
     * 归一化生理期偏好标记
     * @param {Object} staff - 员工对象
     * @returns {string|null} 'first' | 'second' | null
     */
    normalizeMenstrualPeriod(staff) {
        const raw = staff.menstrualPeriod || staff.menstrualPeriodType || staff.menstrualPeriodPreference;
        if (!raw) return null;

        const value = String(raw).trim();
        if (value === 'first' || value === '上' || value === '上半' || value === '上半月' || value === 'upper') {
            return 'first';
        }
        if (value === 'second' || value === '下' || value === '下半' || value === '下半月' || value === 'lower') {
            return 'second';
        }

        return null;
    },

    /**
     * 解析日期范围字符串（如 "1-15"）
     * @param {string} rangeStr - 范围字符串
     * @returns {Object|null} { start: number, end: number }
     */
    parseDayRange(rangeStr) {
        if (!rangeStr || typeof rangeStr !== 'string') {
            return null;
        }

        const match = rangeStr.match(/(\d+)\s*-\s*(\d+)/);
        if (!match) {
            return null;
        }

        const start = parseInt(match[1], 10);
        const end = parseInt(match[2], 10);
        if (Number.isNaN(start) || Number.isNaN(end)) {
            return null;
        }

        return { start, end };
    },

    /**
     * 检查生理期
     * @param {Object} staff - 女性员工对象
     * @param {string} date - 日期字符串
     * @returns {Object} { isInPeriod: boolean, period: string }
     */
    checkMenstrualPeriod(staff, date) {
        const menstrualConfig = NightShiftConfigRules.getMenstrualPeriodConfig();

        if (!menstrualConfig.enabled) {
            return { isInPeriod: false };
        }

        // 获取该员工的生理期偏好（上半月或下半月）
        const period = this.normalizeMenstrualPeriod(staff);

        // 解析日期
        const day = parseInt(date.split('-')[2], 10);

        if (!period) {
            return {
                isInPeriod: false,
                period: 'none',
                periodName: '无偏好',
                day
            };
        }

        const firstRange = this.parseDayRange(menstrualConfig.firstHalf);
        const secondRange = this.parseDayRange(menstrualConfig.secondHalf);

        let isInPeriod = false;
        let periodName = '';

        if (period === 'first') {
            // 上半月：1-15号
            const start = firstRange ? firstRange.start : 1;
            const end = firstRange ? firstRange.end : 15;
            isInPeriod = day >= start && day <= end;
            periodName = '上半月';
        } else {
            // 下半月：16-31号
            const start = secondRange ? secondRange.start : 16;
            const end = secondRange ? secondRange.end : 31;
            isInPeriod = day >= start && day <= end;
            periodName = '下半月';
        }

        return {
            isInPeriod,
            period,
            periodName,
            day
        };
    },

    /**
     * 检查休假冲突
     * @param {Object} staff - 员工对象
     * @param {string} date - 起始日期
     * @param {number} bufferDays - 缓冲天数
     * @returns {Object} { hasConflict: boolean, conflicts: array }
     */
    checkVacationConflict(staff, date, bufferDays) {
        const conflicts = [];

        // 获取个人休假需求
        const personalRequests = Store.state?.personalRequests || {};
        const staffRequests = personalRequests[this.getStaffId(staff)] || {};

        // ✅ 新增：首先检查指定日期本身的休假
        if (staffRequests[date]) {
            const vacationType = staffRequests[date];
            console.log(`[休假冲突] ${staff.name} 在 ${date} 有${vacationType}休假，不能排大夜`);
            conflicts.push({
                date: date,
                type: vacationType,
                dayOffset: 0,
                isTargetDate: true  // 标记为目标日期
            });
        }

        // 休假后缓冲期检查：仅检查起始日前的bufferDays天
        const startDate = new Date(date);
        for (let i = 1; i <= bufferDays; i++) {
            const checkDate = new Date(startDate);
            checkDate.setDate(startDate.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];

            if (staffRequests[dateStr]) {
                conflicts.push({
                    date: dateStr,
                    type: staffRequests[dateStr],
                    dayOffset: -i,
                    source: 'vacation_buffer'
                });
            }
        }

        return {
            hasConflict: conflicts.length > 0,
            conflicts
        };
    },

    /**
     * 检查是否可以开始连续夜班周期
     * @param {Object} staff - 员工对象
     * @param {string} startDate - 起始日期
     * @param {number} consecutiveDays - 连续天数
     * @param {string} regionKey - 地区代码
     * @returns {Object} { canStart: boolean, reasons: array }
     */
    canStartConsecutivePeriod(staff, startDate, consecutiveDays, regionKey) {
        const reasons = [];
        const startDateObj = new Date(startDate);

        // 检查连续的每一天
        for (let i = 0; i < consecutiveDays; i++) {
            const checkDate = new Date(startDateObj);
            checkDate.setDate(startDateObj.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];

            // 检查是否已有其他排班
            const scheduleData = Store.state?.scheduleData || {};
            const staffSchedule = scheduleData[this.getStaffId(staff)] || {};
            const existingShift = staffSchedule[dateStr];

            if (existingShift && existingShift !== '') {
                reasons.push({
                    date: dateStr,
                    reason: 'already_scheduled',
                    existingShift
                });
            }

            // 检查是否已排了其他大夜（避免冲突）
            if (this.currentSchedule) {
                const daySchedule = this.currentSchedule[dateStr] || [];
                const alreadyAssigned = daySchedule.some(s => s.staffId === this.getStaffId(staff));
                if (alreadyAssigned) {
                    reasons.push({
                        date: dateStr,
                        reason: 'already_night_shift'
                    });
                }
            }
        }

        return {
            canStart: reasons.length === 0,
            reasons
        };
    },

    /**
     * 检查排班周期结尾约束
     * @param {string} startDate - 起始日期
     * @param {number} consecutiveDays - 连续天数
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} { canStart: boolean, message: string }
     */
    checkPeriodEndConstraint(startDate, consecutiveDays, dateRange) {
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(dateRange.endDate);

        // 【P1-1修复】计算从开始日期到周期结束还有多少天
        const daysUntilEnd = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;

        // 如果在周期末尾（剩余天数不足标准连续天数）
        if (daysUntilEnd < consecutiveDays) {
            // ✅ 修复：周期末尾特殊处理
            // 策略：不缩减连续天数，但标记为末尾轮换模式
            // 这样可以让新的人员按标准连续天数开始，即使会超出周期范围
            // 关键是要确保每天都有新的人员开始轮换，而不是缩减连续天数导致后续无人可用

            if (daysUntilEnd >= 1) {
                console.log(`[checkPeriodEndConstraint] 周期末尾：剩余${daysUntilEnd}天，标准${consecutiveDays}天，允许开始（末尾轮换模式）`);
                return {
                    canStart: true,
                    adjustedDays: consecutiveDays,  // 保持标准连续天数
                    isEndOfPeriodRotation: true,  // 标记为末尾轮换
                    priority: 1000,  // 提高优先级
                    message: `周期末尾轮换：剩余${daysUntilEnd}天，按标准${consecutiveDays}天分配`
                };
            } else {
                // 剩余0天或负数，不能开始
                return {
                    canStart: false,
                    message: `已到周期末尾，无法开始新的排班`
                };
            }
        }

        // 周期内有足够天数，无需调整
        return {
            canStart: true,
            adjustedDays: consecutiveDays,
            isEndOfPeriodRotation: false,
            priority: 0
        };
    },

    // ==================== C. 大夜排班生成 ====================

    /**
     * 生成大夜排班
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @param {Object} config - 可选的配置覆盖
     * @returns {Object} 排班结果和统计信息
     */
    async generateNightShiftSchedule(dateRange, config = null) {
        console.log('[NightShiftManager] 开始生成大夜排班');
        console.log(`  - 日期范围: ${dateRange.startDate} 至 ${dateRange.endDate}`);

        try {
            // 如果提供了配置覆盖，先更新配置
            if (config) {
                await NightShiftConfigRules.updateConfig(config);
            }

            // 检查是否启用了渐进式求解算法
            const solverExists = typeof NightShiftSolver !== 'undefined';
            const solverMode = solverExists ? NightShiftSolver.algorithmMode : 'undefined';
            const incrementalSolverExists = typeof IncrementalNightShiftSolver !== 'undefined';
            const useIncremental = solverExists &&
                                   solverMode === 'incremental' &&
                                   incrementalSolverExists;

            // 调试日志
            console.log('[NightShiftManager] 算法判断:', {
                nightShiftSolverExists: solverExists,
                algorithmMode: solverMode,
                incrementalSolverExists: incrementalSolverExists,
                useIncremental: useIncremental,
                NightShiftSolver: typeof NightShiftSolver,
                IncrementalNightShiftSolver: typeof IncrementalNightShiftSolver
            });

            // 如果启用了增量渐进式求解算法，使用 IncrementalNightShiftSolver
            if (useIncremental) {
                console.log('[NightShiftManager] 使用 IncrementalNightShiftSolver 渐进式求解算法');

                // 获取人员数据
                const staffData = Store.getCurrentStaffData();

                // 获取个性化休假请求
                const personalRequests = Store.getAllPersonalRequests();

                // 获取休息日配置
                const restDays = Store.getAllRestDays();

                // 获取配置规则
                const configRules = NightShiftConfigRules.getConfig();

                // 调用增量求解器
                const incrementalResult = await IncrementalNightShiftSolver.solve({
                    staffData: staffData,
                    scheduleConfig: {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate
                    },
                    personalRequests: personalRequests,
                    restDays: restDays,
                    configRules: configRules
                });

                // 转换为 NightShiftManager 期望的格式
                const schedule = {};
                const dateList = this.getDateList(dateRange);

                // 初始化空排班表
                dateList.forEach(date => {
                    schedule[date] = [];
                });

                // 填充排班数据
                for (const [staffId, dates] of Object.entries(incrementalResult.schedule)) {
                    const staff = staffData.find(s => (s.id || s.staffId) === staffId);
                    const name = staff ? staff.name : staffId;

                    for (const [dateStr, shiftType] of Object.entries(dates)) {
                        if (shiftType === 'NIGHT' && schedule[dateStr]) {
                            schedule[dateStr].push({
                                staffId: staffId,
                                name: name,
                                shiftType: 'NIGHT'
                            });
                        }
                    }
                }

                // 保存到实例变量
                this.currentSchedule = schedule;

                // 持久化到数据库
                await DB.saveNightShiftSchedule({
                    scheduleId: 'current',
                    schedule: incrementalResult.schedule, // 保存原始格式供后续使用
                    stats: incrementalResult.stats,
                    dateRange,
                    createdAt: new Date().toISOString()
                });

                // 转换为兼容格式返回
                const result = {
                    schedule: schedule,
                    stats: incrementalResult.stats,
                    dateRange,
                    generatedAt: new Date().toISOString()
                };

                console.log('[NightShiftManager] 大夜排班生成完成（IncrementalNightShiftSolver）');
                console.log(`  - 总夜班数: ${incrementalResult.stats.totalNightShifts}`);
                return result;
            }

            // 如果增量求解器未加载，回退到 NightShiftSolver 或 Legacy 算法
            console.warn('[NightShiftManager] IncrementalNightShiftSolver 未加载，尝试使用 NightShiftSolver');

            if (solverExists) {
                console.log('[NightShiftManager] 使用 NightShiftSolver');
                const staffData = Store.getCurrentStaffData();
                const personalRequests = Store.getAllPersonalRequests();
                const restDays = Store.getAllRestDays();
                const scheduleConfig = {
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate
                };

                const nightShiftResult = await NightShiftSolver.generateNightShiftSchedule({
                    staffData,
                    scheduleConfig,
                    personalRequests,
                    restDays,
                    options: {
                        algorithm: solverMode === 'incremental' ? 'incremental' : 'legacy'
                    }
                });

                // 转换格式
                const schedule = NightShiftSolver.convertToDateBasedFormat(
                    nightShiftResult.schedule,
                    staffData
                );

                return {
                    schedule,
                    stats: nightShiftResult.stats,
                    dateRange,
                    generatedAt: new Date().toISOString()
                };
            }

            // 以下是原有的 legacy 算法（当 NightShiftSolver 也未加载时使用）
            console.log('[NightShiftManager] 使用 Legacy 算法（NightShiftSolver 也不可用）');

            // 初始化日期列表
            const dateList = this.getDateList(dateRange);

            // 检查是否启用严格连续排班模式
            const strictConfig = NightShiftConfigRules.getConfig().strictContinuous || {};
            if (strictConfig.enabled) {
                console.log('[NightShiftManager] 使用严格连续排班算法');
                return await this.generateStrictContinuousSchedule(dateRange);
            }

            // 1. 计算所有地区的人力富裕程度
            const manpowerAnalysis = this.calculateAllManpowerSufficiency(dateRange);

            // 2. 初始化空的排班表
            const schedule = {};
            dateList.forEach(date => {
                schedule[date] = [];
            });

            // 3. 为上海分配大夜
            const shanghaiConfig = NightShiftConfigRules.getRegionConfig('shanghai');
            const crossRegionConfig = NightShiftConfigRules.getCrossRegionConfig();

            // 3.1 分配上海
            const shanghaiResult = await this.assignNightShiftsForRegion(
                'shanghai',
                dateList,
                schedule,
                manpowerAnalysis.shanghai,
                dateRange
            );

            // 4. 生成统计信息
            const stats = this.calculateScheduleStats(schedule, dateList, manpowerAnalysis);

            // 5. 保存到实例变量
            this.currentSchedule = schedule;

            // 6. 持久化到数据库
            await DB.saveNightShiftSchedule({
                scheduleId: 'current',
                schedule,
                stats,
                dateRange,
                createdAt: new Date().toISOString()
            });

            const result = {
                schedule,
                stats,
                manpowerAnalysis,
                dateRange,
                generatedAt: new Date().toISOString()
            };

            console.log('[NightShiftManager] 大夜排班生成完成（Legacy）');
            return result;
        } catch (error) {
            console.error('[NightShiftManager] 生成大夜排班失败:', error);
            throw error;
        }
    },

    /**
     * 为单个地区分配大夜
     * @param {string} regionKey - 地区代码
     * @param {Array} dateList - 日期列表
     * @param {Object} schedule - 排班表（会被修改）
     * @param {Object} manpowerInfo - 人力信息
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} 分配结果统计
     */
    async assignNightShiftsForRegion(regionKey, dateList, schedule, manpowerInfo, dateRange) {
        console.log(`[NightShiftManager] 为 ${regionKey} 地区分配大夜`);

        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
        const allStaff = this.getStaffByRegion(regionKey);

        // 分离男女员工
        const males = allStaff.filter(s => s.gender === '男' && this.canDoNightShift(s));
        const females = allStaff.filter(s => s.gender === '女' && this.canDoNightShift(s));

        console.log(`[NightShiftManager] ${regionKey} 可用员工: 男${males.length}人, 女${females.length}人`);

        // 【NEW】使用完美填充算法
        console.log(`\n[NightShiftManager] ========== 使用完美填充算法 ==========`);
        // 【修复】始终以 dailyMax 为目标，确保每天都尽量满足最大人数需求
        // 之前的逻辑是人力不足时降配到 dailyMin，但这会导致很多天只有1人大夜
        // 正确做法：即使人力不足，也应该尽量满足每天 dailyMax 人，不足的天数自然会少于目标
        const dailyTarget = regionConfig.dailyMax;

        const result = this.assignNightShiftsWithPerfectFill(
            regionKey,
            dateList,
            schedule,
            males,
            females,
            dateRange,
            dailyTarget,
            manpowerInfo
        );

        console.log(`[NightShiftManager] ${regionKey} 地区分配完成`);
        console.log(`[NightShiftManager] 完美填充统计:`, result.stats);

        return { success: true, stats: result.stats };
    },

    /**
     * 为指定日期分配人员
     * @param {string} date - 日期
     * @param {number} needed - 需要的人数
     * @param {Array} priorityQueue - 优先级队列
     * @param {Object} schedule - 排班表
     * @param {string} regionKey - 地区代码
     * @param {number} maleTargetDays - 男生目标天数
     * @param {number} femaleTargetDays - 女生目标天数
     * @param {number} maleMaxDays - 男生硬上限
     * @param {number} femaleMaxDays - 女生硬上限
     * @param {number} maleConsecutiveDays - 男生连续天数
     * @param {number} femaleConsecutiveDays - 女生连续天数
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {number} 实际分配的人数
     */
    assignForDay(date, needed, priorityQueue, schedule, regionKey, maleTargetDays, femaleTargetDays, maleMaxDays, femaleMaxDays, maleConsecutiveDays, femaleConsecutiveDays, dateRange) {
        let assigned = 0;

        // ✅ 修复：在周期末尾时，重新计算优先级（优先选择排班天数少的人）
        const isNearPeriodEnd = this.isNearPeriodEnd(date, dateRange);
        let sortedQueue = priorityQueue;

        if (isNearPeriodEnd) {
            sortedQueue = this.resortQueueForPeriodEnd(priorityQueue, schedule, date);
            console.log(`[assignForDay] ${date} 周期末尾，重新排序优先级队列`);
        }

        for (const staff of sortedQueue) {
            if (assigned >= needed) break;

            // 【P0-1修复】获取该员工的硬上限和目标天数
            const maxDaysPerMonth = staff.gender === '女' ? femaleMaxDays : maleMaxDays;
            const targetDays = staff.gender === '女' ? femaleTargetDays : maleTargetDays;

            // 【P0-1修复】统计该员工已分配的天数
            let currentDays = 0;
            for (const dateStr in schedule) {
                const daySchedule = schedule[dateStr];
                if (daySchedule.some(s => s.staffId === this.getStaffId(staff))) {
                    currentDays++;
                }
            }

            // 【P0-1修复】检查是否已达到硬上限（硬性限制，不能超过）
            if (currentDays >= maxDaysPerMonth) {
                console.log(`[assignForDay] ${staff.name}已分配${currentDays}天，达到硬上限${maxDaysPerMonth}天，跳过`);
                continue;
            }

            // 检查是否可以在该日期排夜班
            const eligibility = this.checkEligibility(staff, date, regionKey, dateRange);
            if (!eligibility.eligible) {
                // ✅ 修复：如果是周期末尾且原因是period_end_constraint，记录一下方便调试
                if (eligibility.reason === 'period_end_constraint' && eligibility.details && eligibility.details.isEndOfPeriodRotation) {
                    console.log(`[assignForDay] ${staff.name}处于周期末尾轮换模式，优先级=${eligibility.details.priority}`);
                }
                continue;
            }

            // ✅ 关键修复：在周期末尾时，采用单日分配模式，不分配连续天数
            // 这样可以避免"连续天数被缩减导致后续几天无人可用"的问题
            if (isNearPeriodEnd && eligibility.details && eligibility.details.isEndOfPeriodRotation) {
                // 周期末尾单日分配模式：只分配当天，不分配后续天数
                console.log(`[assignForDay] ${date} 周期末尾单日分配模式：${staff.name}（已分配${currentDays}天）`);

                // 只分配当天
                const dateStr = date;
                if (!schedule[dateStr]) {
                    schedule[dateStr] = [];
                }

                schedule[dateStr].push({
                    staffId: this.getStaffId(staff),
                    name: staff.name,
                    gender: staff.gender,
                    region: regionKey,
                    date: dateStr
                });

                assigned++;
                continue;  // 跳过连续分配逻辑
            }

            // 【P0-1修复】确定连续天数
            // 如果已分配天数 < 目标天数，则按标准连续天数分配
            // 如果已分配天数 >= 目标天数，则只分配剩余天数（达到硬上限为止）
            let consecutiveDays = staff.gender === '女' ? femaleConsecutiveDays : maleConsecutiveDays;

            // ✅ 修复：如果checkEligibility返回了调整后的连续天数，使用它
            if (eligibility.details && eligibility.details.adjustedDays) {
                consecutiveDays = eligibility.details.adjustedDays;
                console.log(`[assignForDay] 使用调整后的连续天数：${consecutiveDays}天`);
            }

            // 计算还可以分配多少天（受硬上限限制）
            const remainingDays = maxDaysPerMonth - currentDays;
            const actualConsecutiveDays = Math.min(consecutiveDays, remainingDays);

            console.log(`[assignForDay] ${staff.name}已分配${currentDays}天，目标${targetDays}天，上限${maxDaysPerMonth}天，本次分配${actualConsecutiveDays}天`);

            // 分配连续的大夜
            const startDateObj = new Date(date);
            for (let i = 0; i < actualConsecutiveDays; i++) {
                const assignDate = new Date(startDateObj);
                assignDate.setDate(startDateObj.getDate() + i);
                const dateStr = assignDate.toISOString().split('T')[0];

                if (!schedule[dateStr]) {
                    schedule[dateStr] = [];
                }

                // 检查是否已满员
                const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
                if (schedule[dateStr].filter(s => s.region === regionKey).length >= regionConfig.dailyMax) {
                    console.log(`[assignForDay] ${dateStr} 已满员，停止连续分配`);
                    break;
                }

                schedule[dateStr].push({
                    staffId: this.getStaffId(staff),
                    name: staff.name,
                    gender: staff.gender,
                    region: regionKey,
                    date: dateStr
                });
            }

            assigned++;
        }

        return assigned;
    },

    /**
     * 确保总约束（仅上海）
     * @param {Array} dateList - 日期列表
     * @param {Object} schedule - 排班表
     * @param {Object} crossRegionConfig - 总约束配置
     * @param {Object} manpowerAnalysis - 人力分析
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     */
    async ensureCrossRegionConstraints(dateList, schedule, crossRegionConfig, manpowerAnalysis, dateRange) {
        console.log('[NightShiftManager] 检查总约束（仅上海）');

        for (const date of dateList) {
            const shanghaiAssigned = schedule[date].filter(s => s.region === 'shanghai').length;
            const total = shanghaiAssigned;

            // 检查是否超过最大总人数（移除多余的人员）
            if (total > crossRegionConfig.totalDailyMax) {
                const excess = total - crossRegionConfig.totalDailyMax;
                this.removeExcessStaff(date, schedule, excess);
            }
        }

        console.log('[NightShiftManager] 总约束检查完成');
    },

    /**
     * 从另一个地区补充人员
     * @param {string} mainRegion - 主地区
     * @param {string} backupRegion - 备用地区
     * @param {string} date - 日期
     * @param {Object} schedule - 排班表
     * @param {number} needed - 需要的人数
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     */
    async backupFromOtherRegion(mainRegion, backupRegion, date, schedule, needed, dateRange, manpowerInfo = null) {
        console.log(`[NightShiftManager] 从 ${backupRegion} 补充 ${mainRegion}`);

        const backupStaff = this.getStaffByRegion(backupRegion);
        const eligible = backupStaff.filter(s => this.canDoNightShift(s));

        for (const staff of eligible) {
            if (needed <= 0) break;

            const limits = this.getEffectiveNightShiftLimits(staff, mainRegion, manpowerInfo);
            const consecutiveDays = Math.max(3, limits.consecutiveDays);
            const eligibility = this.checkEligibility(staff, date, backupRegion, dateRange, manpowerInfo);
            if (!eligibility.eligible) {
                continue;
            }

            // 必须形成连续段，否则不补
            const segment = [];
            const startDateObj = new Date(date);
            for (let i = 0; i < consecutiveDays; i++) {
                const d = new Date(startDateObj);
                d.setDate(startDateObj.getDate() + i);
                const dateStr = d.toISOString().split('T')[0];
                if (dateRange && (dateStr < dateRange.startDate || dateStr > dateRange.endDate)) {
                    break;
                }
                segment.push(dateStr);
            }

            if (segment.length < consecutiveDays) {
                continue;
            }

            let canAssignSegment = true;
            for (const dateStr of segment) {
                if (!this.canAssignOnDate(staff, dateStr, schedule, mainRegion, dateRange, manpowerInfo)) {
                    canAssignSegment = false;
                    break;
                }
            }

            if (canAssignSegment) {
                this.assignStaffToSegment(staff, segment, schedule, mainRegion);
                needed--;
            }
        }
    },

    /**
     * 移除多余的人员
     * @param {string} date - 日期
     * @param {Object} schedule - 排班表
     * @param {number} excess - 多余的人数
     */
    removeExcessStaff(date, schedule, excess) {
        // 移除最后分配的人员（优先级最低的）
        const currentCount = schedule[date].length;
        const targetCount = currentCount - excess;

        // 按优先级排序（上月夜班天数少的优先移除）
        schedule[date].sort((a, b) => {
            const aLastMonth = this.getLastMonthNightShiftDays(a.staffId) || 0;
            const bLastMonth = this.getLastMonthNightShiftDays(b.staffId) || 0;
            return aLastMonth - bLastMonth;
        });

        schedule[date] = schedule[date].slice(0, targetCount);
    },

    // ==================== D. 辅助方法 ====================

    /**
     * 获取员工ID（兼容不同的ID字段名称）
     * @param {Object} staff - 员工对象
     * @returns {string} 员工ID
     */
    getStaffId(staff) {
        return staff.staffId || staff.id || staff.staff_id || '';
    },

    /**
     * 获取指定地区的所有员工
     * @param {string} regionKey - 地区代码
     * @returns {Array} 员工列表
     */
    getStaffByRegion(regionKey) {
        const allStaff = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);

        console.log(`[NightShiftManager] getStaffByRegion(${regionKey}): 总员工数=${allStaff.length}, 地区别名=${regionConfig.aliases.join(', ')}`);

        // 显示前5个员工的location信息，帮助调试
        if (allStaff.length > 0) {
            console.log('[NightShiftManager] 前5个员工的location信息:');
            allStaff.slice(0, 5).forEach(staff => {
                console.log(`  - ${staff.name}: location="${staff.location}", workplace="${staff.workplace}", workLocation="${staff.workLocation || 'N/A'}", gender="${staff.gender}"`);
            });
        }

        return allStaff.filter(staff => {
            const location = staff.location || staff.workplace || staff.workLocation || '';
            return regionConfig.aliases.includes(location);
        });
    },

    /**
     * 判断员工是否可以排夜班
     * @param {Object} staff - 员工对象
     * @returns {boolean}
     */
    canDoNightShift(staff) {
        // 检查是否有明确的排夜班限制标记
        if (staff.canNightShift === false) {
            return false;
        }

        if (typeof staff.canNightShift === 'string') {
            const normalized = staff.canNightShift.trim().toLowerCase();
            if (normalized === '否' || normalized === '不' || normalized === 'no' || normalized === 'false' || normalized === '0') {
                return false;
            }
            return true;
        }

        // 检查特殊状态
        if (staff.isPregnant || staff.pregnant) {
            return false; // 孕妇不能排夜班
        }

        if (staff.isLactating || staff.lactating) {
            return false; // 哺乳期不能排夜班
        }

        // 默认允许排夜班（可以根据业务需求扩展其他条件）
        return true;
    },

    /**
     * 获取日期范围内的天数
     * @param {Object} dateRange - 日期范围
     * @returns {number} 天数
     */
    getDaysInRange(dateRange) {
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);
        const diff = end - start;
        return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
    },

    /**
     * 获取日期范围内的日期列表
     * @param {Object} dateRange - 日期范围
     * @returns {Array<string>} 日期列表
     */
    getDateList(dateRange) {
        const dates = [];
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().split('T')[0]);
        }

        return dates;
    },

    /**
     * 计算优先级队列
     * @param {Array} males - 男生列表
     * @param {Array} females - 女生列表
     * @param {string} regionKey - 地区代码
     * @returns {Array} 排序后的员工列表
     */
    calculatePriorityQueue(males, females, regionKey) {
        const priorityConfig = NightShiftConfigRules.getPriorityConfig();

        // 合并男女员工
        const allStaff = [...males, ...females];

        // 【P0-3修复】为每个员工计算优先级分数（上月夜班少的人优先）
        const calcScore = (staff) => {
            const lastMonthDays = this.getLastMonthNightShiftDays(this.getStaffId(staff)) || 0;

            // 【关键修复】上月夜班天数越少，分数越高（优先级越高）
            // 使用负数使得天数少的人分数高
            const score = -lastMonthDays * 100;  // 乘以100确保优先级权重足够大

            console.log(`[calculatePriorityQueue] ${staff.name}: 上月大夜${lastMonthDays}天, 分数${score}`);

            return score;
        };

        // 按优先级排序（分数高的优先，即上月夜班少的人优先）
        allStaff.sort((a, b) => calcScore(b) - calcScore(a));

        // 对分数相同的员工进行随机打乱（增加公平性）
        this.shuffleStaffWithSameScore(allStaff);

        console.log(`[NightShiftManager] ${regionKey} 地区员工队列已排序（上月大夜少优先），共${allStaff.length}人`);
        return allStaff;
    },

    /**
     * 对分数相同的员工进行随机打乱
     * @param {Array} staffList - 已排序的员工列表
     */
    shuffleStaffWithSameScore(staffList) {
        // 按分数分组
        const groups = new Map();
        for (const staff of staffList) {
            const lastMonthDays = this.getLastMonthNightShiftDays(this.getStaffId(staff)) || 0;
            const score = -lastMonthDays * 100;

            if (!groups.has(score)) {
                groups.set(score, []);
            }
            groups.get(score).push(staff);
        }

        // 对每个组内的员工随机打乱
        const result = [];
        for (const [score, group] of groups) {
            // Fisher-Yates洗牌
            for (let i = group.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [group[i], group[j]] = [group[j], group[i]];
            }
            result.push(...group);
        }

        // 将打乱后的结果复制回原数组
        staffList.length = 0;
        staffList.push(...result);
    },

    /**
     * 基于员工ID随机打乱员工列表
     * 使用员工ID和时间戳作为随机种子，确保每次排班时不同地区内顺序不同
     * @param {Array} staffList - 员工列表
     * @param {string} regionKey - 地区代码
     * @returns {Array} 打乱后的员工列表
     */
    shuffleStaffById(staffList, regionKey) {
        // 创建一个带ID的数组副本
        const shuffled = [...staffList];

        // 生成随机种子（基于当前时间戳和地区代码）
        const seed = Date.now() + regionKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        // 使用种子随机数生成器进行Fisher-Yates洗牌
        let randomState = seed;
        const seededRandom = () => {
            randomState = (randomState * 9301 + 49297) % 233280;
            return randomState / 233280;
        };

        // Fisher-Yates洗牌算法
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        console.log(`[NightShiftManager] 已随机打乱 ${regionKey} 地区员工顺序（种子=${seed}）`);
        return shuffled;
    },

    /**
     * 获取员工上月夜班天数
     * @param {string} staffId - 员工ID
     * @returns {number} 夜班天数
     */
    getLastMonthNightShiftDays(staffId) {
        // 从历史排班数据中获取
        const historyData = Store.state?.staffHistory?.[staffId];
        if (historyData && historyData.lastMonthNightShiftDays !== undefined) {
            return historyData.lastMonthNightShiftDays;
        }

        // 或者从当前排班结果中统计
        // 这里需要根据实际数据结构调整
        return 0;
    },

    /**
     * 判断指定日期是否接近周期末尾
     * @param {string} date - 日期字符串
     * @param {Object} dateRange - 日期范围
     * @returns {boolean} 是否接近周期末尾
     */
    isNearPeriodEnd(date, dateRange) {
        if (!dateRange || !dateRange.endDate) return false;

        const dateObj = new Date(date);
        const endDateObj = new Date(dateRange.endDate);
        const daysUntilEnd = Math.ceil((endDateObj - dateObj) / (1000 * 60 * 60 * 24)) + 1;

        // 如果距离周期结束不足5天，视为周期末尾
        return daysUntilEnd <= 5;
    },

    /**
     * 在周期末尾重新排序员工队列（优先选择排班天数少的人）
     * @param {Array} priorityQueue - 原始优先级队列
     * @param {Object} schedule - 当前排班表
     * @param {string} currentDate - 当前日期
     * @returns {Array} 重新排序后的队列
     */
    resortQueueForPeriodEnd(priorityQueue, schedule, currentDate) {
        // 统计每个员工已分配的天数
        const staffDays = new Map();
        for (const staff of priorityQueue) {
            let days = 0;
            for (const dateStr in schedule) {
                const daySchedule = schedule[dateStr];
                if (daySchedule.some(s => s.staffId === this.getStaffId(staff))) {
                    days++;
                }
            }
            staffDays.set(this.getStaffId(staff), days);
        }

        // 重新排序：排班天数少的人优先
        const sorted = [...priorityQueue].sort((a, b) => {
            const daysA = staffDays.get(this.getStaffId(a)) || 0;
            const daysB = staffDays.get(this.getStaffId(b)) || 0;
            return daysA - daysB;  // 天数少的优先
        });

        console.log(`[resortQueueForPeriodEnd] 队列重新排序完成，前5人:`, sorted.slice(0, 5).map(s => `${s.name}(${staffDays.get(this.getStaffId(s))}天)`));

        return sorted;
    },

    /**
     * 完美填充算法（Perfect Fill Algorithm）
     *
     * 核心思想：
     * 1. 不逐天贪心分配，而是预先规划每个员工的连续工作周期
     * 2. 使用3天和4天的组合完美填充31天周期
     * 3. 考虑上下半月偏好（上半月偏好的人只能在16-31工作，下半月偏好的人只能在1-15工作）
     * 4. 考虑大夜是否可排（canNightShift === '否'的人不能排）
     *
     * @param {string} regionKey - 地区代码
     * @param {Array} dateList - 日期列表
     * @param {Object} schedule - 排班表（会被修改）
     * @param {Array} maleStaff - 男性员工列表
     * @param {Array} femaleStaff - 女性员工列表
     * @param {Object} dateRange - 日期范围
     * @param {number} dailyTarget - 每天目标人数
     * @returns {Object} 分配结果
     */
    assignNightShiftsWithPerfectFill(regionKey, dateList, schedule, maleStaff, femaleStaff, dateRange, dailyTarget, manpowerInfo = null) {
        console.log(`\n[PerfectFill] ========== 开始完美填充算法 (${regionKey}) ==========`);
        console.log(`[PerfectFill] 日期范围: ${dateRange.startDate} 至 ${dateRange.endDate} (${dateList.length}天)`);
        console.log(`[PerfectFill] 每天目标人数: ${dailyTarget}人`);

        // 1. 过滤可用员工（排除canNightShift === '否'）
        const availableMales = maleStaff.filter(s => this.canDoNightShift(s));
        const availableFemales = femaleStaff.filter(s => this.canDoNightShift(s));

        console.log(`[PerfectFill] 可用员工: 男${availableMales.length}人, 女${availableFemales.length}人`);

        // 2. 计算需求
        const totalDays = dateList.length;
        const totalDemand = totalDays * dailyTarget;  // 总人天需求
        console.log(`[PerfectFill] 总需求: ${totalDays}天 × ${dailyTarget}人/天 = ${totalDemand}人天`);

        // 4. 计算供给
        const constraints = NightShiftConfigRules.getConstraintsConfig();
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
        let maleDaysPerMonth = regionConfig.maleMaxDaysPerMonth;
        let femaleDaysPerMonth = regionConfig.femaleMaxDaysPerMonth;
        let reducedCount = 0;

        if (manpowerInfo && manpowerInfo.adjustmentStrategy === 'reduce' && constraints.allowMaleReduceTo3Days) {
            reducedCount = Array.isArray(manpowerInfo.reduceMaleIds) ? manpowerInfo.reduceMaleIds.length : 0;
            reducedCount = Math.min(reducedCount, availableMales.length);
        } else if (manpowerInfo && manpowerInfo.adjustmentStrategy === 'increase' && constraints.allowMaleIncreaseTo5Days) {
            maleDaysPerMonth = Math.max(maleDaysPerMonth, 5);
        }

        const reducedMaleDays = Math.min(maleDaysPerMonth, 3);
        const maleSupply = reducedCount > 0
            ? (availableMales.length - reducedCount) * maleDaysPerMonth + reducedCount * reducedMaleDays
            : availableMales.length * maleDaysPerMonth;
        const femaleSupply = availableFemales.length * femaleDaysPerMonth;
        const totalSupply = maleSupply + femaleSupply;
        console.log(`[PerfectFill] 总供给: 男${maleSupply}人天 + 女${femaleSupply}人天 = ${totalSupply}人天`);

        if (totalSupply < totalDemand) {
            console.warn(`[PerfectFill] 警告: 供给(${totalSupply}) < 需求(${totalDemand}), 可能无法满足所有天数`);
        }

        // 5. 执行完美填充分配（富足时先保证dailyMin，再冲dailyMax）
        let allocationResult;

        const countAssignedDays = staff => {
            const staffId = this.getStaffId(staff);
            let days = 0;
            for (const dateStr in schedule) {
                if (schedule[dateStr].some(s => s.staffId === staffId)) {
                    days++;
                }
            }
            return days;
        };

        if (manpowerInfo && manpowerInfo.isSufficient && dailyTarget > regionConfig.dailyMin) {
            console.log('[PerfectFill] 人力富足：第一轮按dailyMin填充，第二轮补足dailyMax');

            const firstStaffWithWindows = this.categorizeStaffByWindow(availableMales, availableFemales, dateList);
            console.log(`[PerfectFill] 第一轮员工窗口分类:`, {
                下半月偏好: firstStaffWithWindows.lowerHalf.length,
                上半月偏好: firstStaffWithWindows.upperHalf.length,
                无偏好: firstStaffWithWindows.fullMonth.length
            });

            this.perfectFillAllocation(
                firstStaffWithWindows,
                dateList,
                schedule,
                regionKey,
                dateRange,
                regionConfig.dailyMin,
                manpowerInfo
            );

            const remainingMales = availableMales.filter(s => countAssignedDays(s) === 0);
            const remainingFemales = availableFemales.filter(s => countAssignedDays(s) === 0);
            const secondStaffWithWindows = this.categorizeStaffByWindow(remainingMales, remainingFemales, dateList);
            console.log(`[PerfectFill] 第二轮员工窗口分类:`, {
                下半月偏好: secondStaffWithWindows.lowerHalf.length,
                上半月偏好: secondStaffWithWindows.upperHalf.length,
                无偏好: secondStaffWithWindows.fullMonth.length
            });

            allocationResult = this.perfectFillAllocation(
                secondStaffWithWindows,
                dateList,
                schedule,
                regionKey,
                dateRange,
                dailyTarget,
                manpowerInfo
            );
        } else {
            const staffWithWindows = this.categorizeStaffByWindow(availableMales, availableFemales, dateList);
            console.log(`[PerfectFill] 员工窗口分类:`, {
                下半月偏好: staffWithWindows.lowerHalf.length,
                上半月偏好: staffWithWindows.upperHalf.length,
                无偏好: staffWithWindows.fullMonth.length
            });

            allocationResult = this.perfectFillAllocation(
                staffWithWindows,
                dateList,
                schedule,
                regionKey,
                dateRange,
                dailyTarget,
                manpowerInfo
            );
        }

        console.log(`[PerfectFill] ========== 完美填充算法完成 ==========`);
        return allocationResult;
    },

    /**
     * 根据上下半月偏好对员工进行窗口分类
     * @param {Array} maleStaff - 男性员工
     * @param {Array} femaleStaff - 女性员工
     * @param {Array} dateList - 日期列表
     * @returns {Object} 分类后的员工
     */
    categorizeStaffByWindow(maleStaff, femaleStaff, dateList) {
        const allStaff = [...maleStaff, ...femaleStaff];

        const lowerHalf = [];  // 下半月偏好：只能在1-15工作（前半段）
        const upperHalf = [];  // 上半月偏好：只能在16-31工作（后半段）
        const fullMonth = [];  // 无偏好：可以全月工作

        for (const staff of allStaff) {
            const period = staff.menstrualPeriod || staff.menstrualPeriodType;

            if (period === 'lower' || period === '下' || period === 'second') {
                // 下半月偏好：前半段可用（1-15号对应dateList前半段）
                lowerHalf.push(staff);
            } else if (period === 'upper' || period === '上' || period === 'first') {
                // 上半月偏好：后半段可用（16-31号对应dateList后半段）
                upperHalf.push(staff);
            } else {
                // 无偏好：全月可用
                fullMonth.push(staff);
            }
        }

        // 【稳定性修复】对所有分类按ID排序，确保每次结果一致
        const sortByStaffId = (a, b) => {
            const idA = String(this.getStaffId(a) || '');
            const idB = String(this.getStaffId(b) || '');
            return idA.localeCompare(idB, undefined, { numeric: true });
        };

        lowerHalf.sort(sortByStaffId);
        upperHalf.sort(sortByStaffId);
        fullMonth.sort(sortByStaffId);

        return { lowerHalf, upperHalf, fullMonth };
    },

    /**
     * 执行完美填充分配（核心算法）
     *
     * 策略：
     * 1. 优先分配窗口受限的员工（下半月偏好 → 上半月偏好 → 无偏好）
     * 2. 使用回溯算法找到最优的3天/4天组合
     * 3. 确保每一天都有足够的人数
     *
     * @param {Object} staffWithWindows - 窗口分类后的员工
     * @param {Array} dateList - 日期列表
     * @param {Object} schedule - 排班表（会被修改）
     * @param {string} regionKey - 地区代码
     * @param {Object} dateRange - 日期范围
     * @param {number} dailyTarget - 每天目标人数
     * @returns {Object} 分配结果
     */
    perfectFillAllocation(staffWithWindows, dateList, schedule, regionKey, dateRange, dailyTarget, manpowerInfo = null) {
        console.log(`\n[PerfectFillAllocation] 开始分配...`);

        const totalDays = dateList.length;

        // 【修复】定义工作窗口：基于日号（day of month），而不是 dateList 索引
        // 下半月偏好员工的生理期在16-31号，所以她们只能在日号1-15的日期工作
        // 上半月偏好员工的生理期在1-15号，所以她们只能在日号16-31的日期工作
        const lowerWindow = dateList.filter(dateStr => {
            const day = parseInt(dateStr.split('-')[2], 10);
            return day >= 1 && day <= 15;  // 日号1-15
        }).sort();  // 【稳定性修复】排序确保顺序一致
        
        const upperWindow = dateList.filter(dateStr => {
            const day = parseInt(dateStr.split('-')[2], 10);
            return day >= 16 && day <= 31;  // 日号16-31
        }).sort();  // 【稳定性修复】排序确保顺序一致
        
        const fullWindow = [...dateList].sort();  // 【稳定性修复】排序确保顺序一致
        
        console.log(`[PerfectFillAllocation] 窗口定义: lowerWindow=${lowerWindow.length}天(日号1-15), upperWindow=${upperWindow.length}天(日号16-31), fullWindow=${fullWindow.length}天`);

        // 1. 优先分配下半月偏好员工（只能在前半段工作）
        let lowerAssignments = this.assignStaffToWindow(
            staffWithWindows.lowerHalf,
            lowerWindow,
            schedule,
            regionKey,
            dateRange,
            'lower_half',
            { manpowerInfo }
        );
        console.log(`[PerfectFillAllocation] 下半月偏好员工分配完成: ${lowerAssignments.assigned}人`);

        // 2. 其次分配上半月偏好员工（只能在后半段工作）
        let upperAssignments = this.assignStaffToWindow(
            staffWithWindows.upperHalf,
            upperWindow,
            schedule,
            regionKey,
            dateRange,
            'upper_half',
            { manpowerInfo }
        );
        console.log(`[PerfectFillAllocation] 上半月偏好员工分配完成: ${upperAssignments.assigned}人`);

        // 3. 最后分配无偏好员工（可以全月工作，填补缺口）
        let fullAssignments = this.assignStaffToWindow(
            staffWithWindows.fullMonth,
            fullWindow,
            schedule,
            regionKey,
            dateRange,
            'full_month',
            { fillGaps: true, dailyTarget, manpowerInfo }
        );
        console.log(`[PerfectFillAllocation] 无偏好员工分配完成: ${fullAssignments.assigned}人`);

        // 4. 统计结果
        const stats = this.calculatePerfectFillStats(schedule, dateList, regionKey);
        console.log(`[PerfectFillAllocation] 最终统计:`, stats);

        return {
            success: true,
            stats,
            assignments: {
                lowerHalf: lowerAssignments,
                upperHalf: upperAssignments,
                fullMonth: fullAssignments
            }
        };
    },

    /**
     * 将员工分配到指定的工作窗口
     * @param {Array} staffList - 员工列表
     * @param {Array} window - 工作窗口（日期列表）
     * @param {Object} schedule - 排班表（会被修改）
     * @param {string} regionKey - 地区代码
     * @param {Object} dateRange - 日期范围
     * @param {string} windowType - 窗口类型
     * @param {Object} options - 选项 { fillGaps, dailyTarget }
     * @returns {Object} 分配结果
     */
    assignStaffToWindow(staffList, window, schedule, regionKey, dateRange, windowType, options = {}) {
        console.log(`\n[AssignStaffToWindow] 窗口类型: ${windowType}, 窗口大小: ${window.length}天, 员工数: ${staffList.length}`);

        if (staffList.length === 0 || window.length === 0) {
            return { assigned: 0, assignments: [] };
        }

        // 【稳定性修复】确保员工列表已按ID排序（在categorizeStaffByWindow中已排序，但这里再次确保）
        const sortedStaffList = [...staffList].sort((a, b) => {
            const idA = String(this.getStaffId(a) || '');
            const idB = String(this.getStaffId(b) || '');
            return idA.localeCompare(idB, undefined, { numeric: true });
        });

        let assignedCount = 0;
        const assignments = [];

        // 如果是fillGaps模式，需要找出哪些天人数不足
        const gapDays = options.fillGaps ? this.findGapDays(schedule, window, regionKey, options.dailyTarget) : null;

        const manpowerInfo = options.manpowerInfo || null;

        // 【公平性修复】使用轮询机制：先让每个员工尝试一次，再循环
        // 这样可以确保所有员工都有机会，而不是前面的员工占满所有位置
        const maxRounds = Math.max(1, Math.ceil((options.dailyTarget || 2) * window.length / sortedStaffList.length));
        
        for (let round = 0; round < maxRounds; round++) {
            let roundAssigned = 0;
            
            for (const staff of sortedStaffList) {
                const limits = this.getEffectiveNightShiftLimits(staff, regionKey, manpowerInfo);
                
                // 检查该员工是否已达到上限，如果达到则跳过
                const currentDays = this.countAssignedDays(staff, schedule);
                if (currentDays >= limits.maxDays) {
                    continue;  // 该员工已满，跳过
                }

            // 如果是fillGaps模式，只填补缺口
            if (options.fillGaps && gapDays) {
                const availableGapDays = gapDays.filter(date => {
                    return this.canAssignOnDate(staff, date, schedule, regionKey, dateRange, manpowerInfo);
                });

                if (availableGapDays.length === 0) {
                    console.log(`[AssignStaffToWindow] ${staff.name}没有可用的缺口日期`);
                    continue;
                }

                // 选择最佳的连续段（3天或4天）
                const consecutiveDays = limits.targetDays;
                const bestSegment = this.findBestConsecutiveSegment(
                    availableGapDays,
                    consecutiveDays,
                    staff,
                    schedule,
                    regionKey,
                    dateRange,
                    manpowerInfo
                );

                if (bestSegment) {
                    this.assignStaffToSegment(staff, bestSegment, schedule, regionKey);
                    assignedCount++;
                    roundAssigned++;
                    assignments.push({ staff, segment: bestSegment });
                    console.log(`[AssignStaffToWindow] ${staff.name}分配到缺口: ${bestSegment.join(', ')}`);

                    // 更新缺口
                    for (const date of bestSegment) {
                        const index = gapDays.indexOf(date);
                        if (index > -1) {
                            const currentCount = schedule[date] ? schedule[date].filter(s => s.region === regionKey).length : 0;
                            if (currentCount >= options.dailyTarget) {
                                gapDays.splice(index, 1);
                            }
                        }
                    }
                    
                    // 如果缺口已填满，提前结束
                    if (gapDays.length === 0) {
                        break;
                    }
                }
            } else {
                // 正常模式：尽可能分配
                const consecutiveDays = limits.targetDays;
                const bestSegment = this.findBestConsecutiveSegment(
                    window,
                    consecutiveDays,
                    staff,
                    schedule,
                    regionKey,
                    dateRange,
                    manpowerInfo
                );

                if (bestSegment) {
                    this.assignStaffToSegment(staff, bestSegment, schedule, regionKey);
                    assignedCount++;
                    roundAssigned++;
                    assignments.push({ staff, segment: bestSegment });
                    console.log(`[AssignStaffToWindow] ${staff.name}分配: ${bestSegment.join(', ')}`);
                }
            }
            }
            
            // 如果这一轮没有分配任何人，提前结束（避免无限循环）
            if (roundAssigned === 0 && round > 0) {
                console.log(`[AssignStaffToWindow] 第${round + 1}轮无新分配，提前结束`);
                break;
            }
            
            // 如果缺口已填满（fillGaps模式），提前结束
            if (options.fillGaps && gapDays && gapDays.length === 0) {
                console.log(`[AssignStaffToWindow] 所有缺口已填满，提前结束`);
                break;
            }
        }

        return { assigned: assignedCount, assignments };
    },
    
    /**
     * 统计员工已分配的大夜天数
     * @param {Object} staff - 员工对象
     * @param {Object} schedule - 排班表
     * @returns {number} 已分配天数
     */
    countAssignedDays(staff, schedule) {
        const staffId = this.getStaffId(staff);
        let count = 0;
        for (const dateStr in schedule) {
            if (schedule[dateStr] && schedule[dateStr].some(s => s.staffId === staffId)) {
                count++;
            }
        }
        return count;
    },

    /**
     * 找出人数不足的日期
     * @param {Object} schedule - 排班表
     * @param {Array} window - 工作窗口
     * @param {string} regionKey - 地区代码
     * @param {number} dailyTarget - 每天目标人数
     * @returns {Array} 人数不足的日期列表
     */
    findGapDays(schedule, window, regionKey, dailyTarget) {
        const gaps = [];
        for (const date of window) {
            const currentCount = schedule[date] ? schedule[date].filter(s => s.region === regionKey).length : 0;
            if (currentCount < dailyTarget) {
                gaps.push(date);
            }
        }
        // 【稳定性修复】按日期排序，确保每次顺序一致
        return gaps.sort();
    },

    /**
     * 查找最佳的连续工作段
     * @param {Array} availableDates - 可用日期列表
     * @param {number} targetLength - 目标长度（3或4）
     * @param {Object} staff - 员工对象
     * @param {Object} schedule - 排班表
     * @param {string} regionKey - 地区代码
     * @param {Object} dateRange - 日期范围
     * @returns {Array|null} 最佳连续段，如果找不到返回null
     */
    findBestConsecutiveSegment(availableDates, targetLength, staff, schedule, regionKey, dateRange, manpowerInfo = null) {
        const staffId = this.getStaffId(staff);

        // 统计该员工已分配的天数
        let currentDays = 0;
        for (const dateStr in schedule) {
            if (schedule[dateStr].some(s => s.staffId === staffId)) {
                currentDays++;
            }
        }

        // 硬上限检查
        const limits = this.getEffectiveNightShiftLimits(staff, regionKey, manpowerInfo);
        const maxDays = limits.maxDays;
        if (currentDays >= maxDays) {
            return null;
        }

        // 计算还能分配几天
        const remainingDays = maxDays - currentDays;
        const actualTarget = Math.min(targetLength, remainingDays);

        // 根据性别设置最小连续天数：男性最少3天，女性最少2天
        const minSegmentLength = staff.gender === '女' ? 2 : 3;
        if (actualTarget < minSegmentLength) {
            return null;
        }

        // 在可用日期中寻找连续的actualTarget天
        for (let i = 0; i <= availableDates.length - actualTarget; i++) {
            const segment = availableDates.slice(i, i + actualTarget);
            let isValid = true;

            // 必须是连续自然日
            if (!this.isConsecutiveDates(segment)) {
                isValid = false;
            }

            // 检查这段日期是否都可用
            if (isValid) {
                for (const date of segment) {
                    if (!this.canAssignOnDate(staff, date, schedule, regionKey, dateRange, manpowerInfo)) {
                        isValid = false;
                        break;
                    }
                }
            }

            if (isValid) {
                return segment;
            }
        }

        // 如果找不到完整的actualTarget天，尝试更短的段（男>=3天，女>=2天）
        for (let len = actualTarget - 1; len >= minSegmentLength; len--) {
            for (let i = 0; i <= availableDates.length - len; i++) {
                const segment = availableDates.slice(i, i + len);
                let isValid = true;

                if (!this.isConsecutiveDates(segment)) {
                    isValid = false;
                }

                if (isValid) {
                    for (const date of segment) {
                        if (!this.canAssignOnDate(staff, date, schedule, regionKey, dateRange, manpowerInfo)) {
                            isValid = false;
                            break;
                        }
                    }
                }

                if (isValid) {
                    console.log(`[FindBestSegment] ${staff.name}找不到${actualTarget}天，使用${len}天: ${segment.join(', ')}`);
                    return segment;
                }
            }
        }

        return null;
    },

    /**
     * 判断日期列表是否为连续自然日
     * @param {Array<string>} dates
     * @returns {boolean}
     */
    isConsecutiveDates(dates) {
        if (!dates || dates.length <= 1) return true;
        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            const diff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
            if (diff !== 1) {
                return false;
            }
        }
        return true;
    },

    /**
     * 检查是否可以在指定日期分配员工
     * @param {Object} staff - 员工对象
     * @param {string} date - 日期
     * @param {Object} schedule - 排班表
     * @param {string} regionKey - 地区代码
     * @param {Object} dateRange - 日期范围
     * @returns {boolean} 是否可以分配
     */
    canAssignOnDate(staff, date, schedule, regionKey, dateRange, manpowerInfo = null) {
        const staffId = this.getStaffId(staff);

        // 1. 检查该员工这天是否已经分配
        if (schedule[date] && schedule[date].some(s => s.staffId === staffId)) {
            return false;
        }

        // 2. 禁止多段拆分：已分配过则不再分配新段
        let currentDays = 0;
        for (const dateStr in schedule) {
            if (schedule[dateStr].some(s => s.staffId === staffId)) {
                currentDays++;
            }
        }
        if (currentDays > 0) {
            return false;
        }

        // 3. 检查该员工是否已达到月度上限
        const limits = this.getEffectiveNightShiftLimits(staff, regionKey, manpowerInfo);
        const maxDays = limits.maxDays;
        if (currentDays >= maxDays) {
            return false;
        }

        // 4. 检查当天是否超过地区每日上限
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
        const currentCount = schedule[date].filter(s => s.region === regionKey).length;
        if (currentCount >= regionConfig.dailyMax) {
            return false;
        }

        // 5. 检查基本资格（休假、生理期等）
        const eligibility = this.checkEligibility(staff, date, regionKey, dateRange, manpowerInfo);
        if (!eligibility.eligible) {
            return false;
        }

        return true;
    },

    /**
     * 将员工分配到指定的工作段
     * @param {Object} staff - 员工对象
     * @param {Array} segment - 工作段（日期列表）
     * @param {Object} schedule - 排班表（会被修改）
     * @param {string} regionKey - 地区代码
     */
    assignStaffToSegment(staff, segment, schedule, regionKey) {
        const staffId = this.getStaffId(staff);
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);

        // 连续段必须完整落地：只要有一天已满员，就整体放弃该段
        for (const date of segment) {
            const currentCount = schedule[date]
                ? schedule[date].filter(s => s.region === regionKey).length
                : 0;
            if (currentCount >= regionConfig.dailyMax) {
                return;
            }
        }

        for (const date of segment) {
            if (!schedule[date]) {
                schedule[date] = [];
            }

            schedule[date].push({
                staffId: staffId,
                name: staff.name,
                gender: staff.gender,
                region: regionKey,
                date: date
            });
        }
    },

    /**
     * 计算完美填充的统计信息
     * @param {Object} schedule - 排班表
     * @param {Array} dateList - 日期列表
     * @param {string} regionKey - 地区代码
     * @returns {Object} 统计信息
     */
    calculatePerfectFillStats(schedule, dateList, regionKey) {
        let totalAssigned = 0;
        let insufficientDays = [];
        let perfectDays = 0;

        for (const date of dateList) {
            const count = schedule[date].filter(s => s.region === regionKey).length;
            totalAssigned += count;

            if (count >= 2) {
                perfectDays++;
            } else if (count === 1) {
                insufficientDays.push({ date, count, needed: 1 });
            } else {
                insufficientDays.push({ date, count, needed: 2 });
            }
        }

        return {
            totalAssigned,
            totalDays: dateList.length,
            perfectDays,
            insufficientDays: insufficientDays.length,
            insufficientDetails: insufficientDays,
            coverage: (perfectDays / dateList.length * 100).toFixed(1) + '%'
        };
    },

    /**
     * 检查员工是否已达到月度天数上限
     * @param {Object} staff - 员工对象
     * @param {Object} schedule - 排班表
     * @param {string} regionKey - 地区代码
     * @returns {boolean}
     */
    hasReachedMonthlyLimit(staff, schedule, regionKey) {
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
        const maxDays = staff.gender === '女'
            ? regionConfig.femaleMaxDaysPerMonth
            : regionConfig.maleMaxDaysPerMonth;

        // 统计该员工在当前排班表中的天数
        let count = 0;
        for (const date in schedule) {
            const daySchedule = schedule[date];
            const assigned = daySchedule.some(s => s.staffId === this.getStaffId(staff));
            if (assigned) count++;
        }

        return count >= maxDays;
    },

    /**
     * 计算排班统计信息
     * @param {Object} schedule - 排班表
     * @param {Array} dateList - 日期列表
     * @param {Object} manpowerAnalysis - 人力分析
     * @returns {Object} 统计信息
     */
    calculateScheduleStats(schedule, dateList, manpowerAnalysis) {
        const stats = {
            totalDays: dateList.length,
            shanghai: {
                totalAssignments: 0,
                maleAssignments: 0,
                femaleAssignments: 0,
                dailyAverage: 0
            },
            staffStats: {}
        };

        // 统计每天的分配情况
        for (const date of dateList) {
            const daySchedule = schedule[date] || [];

            daySchedule.forEach(assignment => {
                if (assignment.region === 'shanghai') {
                    stats.shanghai.totalAssignments++;

                    if (assignment.gender === '男') {
                        stats.shanghai.maleAssignments++;
                    } else {
                        stats.shanghai.femaleAssignments++;
                    }

                    // 统计个人天数
                    if (!stats.staffStats[assignment.staffId]) {
                        stats.staffStats[assignment.staffId] = {
                            staffId: assignment.staffId,
                            name: assignment.name,
                            gender: assignment.gender,
                            region: assignment.region,
                            days: 0
                        };
                    }
                    stats.staffStats[assignment.staffId].days++;
                }
            });
        }

        // 计算每天平均
        stats.shanghai.dailyAverage = (stats.shanghai.totalAssignments / stats.totalDays).toFixed(2);

        return stats;
    },

    // ==================== E. UI相关方法 ====================

    /**
     * 显示大夜配置管理（配置列表页面）
     */
    async showNightShiftManagement() {
        console.log('[NightShiftManager] 显示大夜配置管理');

        // 更新标题
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '大夜配置管理';
        }

        // 重置视图状态
        this.currentView = 'configs';
        this.currentConfigId = null;

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        // 显示配置列表
        await this.ensureActiveRequestConfigLoaded();
        await this.renderConfigList(scheduleTable);
    },

    /**
     * 渲染配置列表
     */
    async renderConfigList(container) {
        let configs = Store.getNightShiftConfigs ? Store.getNightShiftConfigs() : [];

        // 优先尝试从 IndexedDB 加载，避免使用过期内存数据
        try {
            const dbConfigs = await DB.loadAllNightShiftConfigManagement();
            if (dbConfigs && dbConfigs.length > 0) {
                // 同步到 Store
                Store.state.nightShiftConfigs = dbConfigs;
                configs = dbConfigs;
                console.log('已从 IndexedDB 加载大夜配置:', configs.length, '个');
            } else if (configs.length === 0) {
                configs = dbConfigs || [];
            }
        } catch (error) {
            console.error('从 IndexedDB 加载配置失败:', error);
        }

        const activeConfigId = Store.getActiveNightShiftConfigId ? Store.getActiveNightShiftConfigId() : null;

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
                    <h2 class="text-2xl font-bold text-gray-800">大夜配置管理</h2>
                    <div class="flex space-x-3">
                        <button onclick="NightShiftManager.showNightShiftConfigUI()"
                            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                            <span>排班配置</span>
                        </button>
                        <button onclick="NightShiftManager.createNewConfig()"
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
                    <h3 class="text-lg font-semibold text-gray-700 mb-2">暂无大夜配置</h3>
                    <p class="text-gray-500 mb-4">创建大夜配置，管理大夜排班规则和配置</p>
                    <button onclick="NightShiftManager.createNewConfig()"
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
                const schedulePeriod = config.scheduleConfig ? `${config.scheduleConfig.startDate} 至 ${config.scheduleConfig.endDate}` : '未设置';

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
                                <button onclick="NightShiftManager.showNightShiftConfigUI()"
                                    class="text-green-600 hover:text-green-800 font-medium">
                                    排班配置
                                </button>
                                ${!isActive ? `
                                    <button onclick="NightShiftManager.activateConfig('${config.configId}')"
                                        class="text-blue-600 hover:text-blue-800 font-medium">
                                        激活
                                    </button>
                                ` : ''}
                                <button onclick="NightShiftManager.viewConfigEntry('${config.configId}')"
                                    class="text-blue-600 hover:text-blue-800 font-medium">
                                    查看
                                </button>
                                <button onclick="NightShiftManager.deleteConfig('${config.configId}')"
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

            // 生成配置名称
            const now = new Date();
            const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const name = `大夜配置-${timestamp}`;

            // 获取当前大夜配置规则
            const currentNightShiftConfig = NightShiftConfigRules.getConfig();

            // 生成配置ID
            const configId = `night_shift_config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 创建完整的配置数据
            const configData = {
                configId: configId,
                name: name,
                nightShiftConfig: currentNightShiftConfig, // 保存当前的大夜配置规则
                scheduleConfig: {
                    startDate: activeSchedulePeriodConfig.scheduleConfig.startDate,
                    endDate: activeSchedulePeriodConfig.scheduleConfig.endDate,
                    year: activeSchedulePeriodConfig.scheduleConfig.year,
                    month: activeSchedulePeriodConfig.scheduleConfig.month
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // 保存到Store
            if (!Store.state.nightShiftConfigs) {
                Store.state.nightShiftConfigs = [];
            }
            Store.state.nightShiftConfigs.push(configData);

            // 保存到IndexedDB
            await DB.saveNightShiftConfigManagement(configData);

            // 激活该配置
            await Store.setActiveNightShiftConfig(configId);

            // 保存状态
            await Store.saveState();

            // 新建配置时清空当前排班结果，避免误用旧数据直接展示
            this.currentSchedule = null;
            this.currentManpowerAnalysis = null;

            // 显示配置详情页面
            await this.viewConfigEntry(configId);

            updateStatus('配置已创建', 'success');
        } catch (error) {
            console.error('createNewConfig 失败:', error);
            alert('创建失败：' + error.message);
        }
    },

    /**
     * 查看配置详情页面
     */
    async viewConfigEntry(configId) {
        console.log('viewConfigEntry 被调用，configId:', configId);

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        try {
            // 获取配置
            const configs = Store.state.nightShiftConfigs || [];
            const config = configs.find(c => c.configId === configId);

            if (!config) {
                alert('配置不存在');
                return;
            }

            // 保存当前配置ID和名称
            this.currentConfigId = configId;
            this.currentView = 'configEntry';

            // 临时加载大夜配置到 NightShiftConfigRules（供后续使用）
            if (config.nightShiftConfig) {
                NightShiftConfigRules.setConfig(config.nightShiftConfig);
            }

            // 如果配置里保存了排班结果，加载到当前状态（便于展示）
            if (config.schedule) {
                this.currentSchedule = config.schedule;
                this.currentManpowerAnalysis = config.manpowerAnalysis || null;
            } else {
                this.currentSchedule = null;
                this.currentManpowerAnalysis = null;
            }

            // 显示配置详情界面
            await this.ensureActiveRequestConfigLoaded();
            this.renderConfigEntryView(config);

        } catch (error) {
            console.error('viewConfigEntry 失败:', error);
            alert('加载配置详情失败：' + error.message);
        }
    },

    /**
     * 渲染配置详情视图
     */
    renderConfigEntryView(config) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const html = `
            <div class="p-4 border-b border-gray-200 bg-white">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <h2 class="text-lg font-bold text-gray-800">大夜配置详情</h2>
                        <input type="text" id="configNameInput" value="${config.name}"
                            class="px-2 py-1 border border-gray-300 rounded text-sm"
                            onchange="NightShiftManager.updateConfigName()"
                            placeholder="配置名称">
                    </div>
                    <div class="flex items-center space-x-2" id="nightShiftActionButtons">
                        <button onclick="NightShiftManager.handleGenerateSchedule()"
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            生成大夜排班
                        </button>
                        <button onclick="NightShiftManager.validateAndSaveSchedule()"
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            校验并保存
                        </button>
                        <button onclick="NightShiftManager.backToConfigList()"
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                            返回配置列表
                        </button>
                    </div>
                </div>

                <div class="text-xs text-gray-500">
                    <p>配置ID: ${config.configId}</p>
                    <p>排班周期: ${config.scheduleConfig ? `${config.scheduleConfig.startDate} 至 ${config.scheduleConfig.endDate}` : '未设置'}</p>
                </div>
            </div>

            <!-- 结果展示区域 -->
            <div id="nightShiftResults">
                <div class="p-8 text-center text-gray-400 bg-gray-50">
                    <p class="text-lg">点击"生成大夜排班"按钮开始</p>
                </div>
            </div>
        `;

        scheduleTable.innerHTML = html;

        // 如果已有排班结果，显示结果
        if (this.currentSchedule) {
            this.renderScheduleResults({
                schedule: this.currentSchedule,
                stats: this.calculateScheduleStats(
                    this.currentSchedule,
                    Object.keys(this.currentSchedule),
                    this.currentManpowerAnalysis
                ),
                manpowerAnalysis: this.currentManpowerAnalysis
            });
        }
    },

    /**
     * 更新配置名称
     */
    async updateConfigName() {
        const newNameInput = document.getElementById('configNameInput');
        if (!newNameInput) return;

        const newName = newNameInput.value.trim();
        if (!newName) {
            alert('配置名称不能为空');
            newNameInput.value = this.currentConfigName || '';
            return;
        }

        const configs = Store.state.nightShiftConfigs || [];
        const config = configs.find(c => c.configId === this.currentConfigId);

        if (config) {
            config.name = newName;
            config.updatedAt = new Date().toISOString();

            // 保存到IndexedDB
            await DB.saveNightShiftConfigManagement(config);
            await Store.saveState();

            updateStatus('配置名称已更新', 'success');
        }
    },

    /**
     * 激活配置
     */
    async activateConfig(configId) {
        try {
            await Store.setActiveNightShiftConfig(configId);
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
        const configs = Store.state.nightShiftConfigs || [];
        const config = configs.find(c => c.configId === configId);
        const isActive = config && config.configId === Store.getActiveNightShiftConfigId();

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
            Store.state.nightShiftConfigs = configs.filter(c => c.configId !== configId);

            // 如果删除的是激活的配置，清除激活状态
            if (isActive) {
                Store.state.activeNightShiftConfigId = null;
            }

            // 从IndexedDB删除
            await DB.deleteNightShiftConfigManagement(configId);

            // 如果当前正在查看被删除配置，重置状态
            if (this.currentConfigId === configId) {
                this.currentConfigId = null;
                this.currentView = 'configs';
                this.currentSchedule = null;
                this.currentManpowerAnalysis = null;
            }

            // 保存状态，避免刷新后旧配置回流
            await Store.saveState();

            // 重新渲染（强制从DB刷新，避免残留）
            await this.renderConfigList(document.getElementById('scheduleTable'));
            updateStatus('配置已删除', 'success');
        } catch (error) {
            alert('删除失败：' + error.message);
        }
    },

    /**
     * 校验并保存大夜排班配置
     */
    async validateAndSaveSchedule() {
        // 检查是否已生成排班
        if (!this.currentSchedule) {
            alert('⚠️ 请先生成大夜排班，然后再进行校验并保存操作。');
            return;
        }

        try {
            // 1. 获取当前配置
            const configs = Store.state.nightShiftConfigs || [];
            const config = configs.find(c => c.configId === this.currentConfigId);

            if (!config) {
                throw new Error('找不到当前配置');
            }

            // 2. 更新配置的排班结果
            config.schedule = this.currentSchedule;
            config.stats = this.calculateScheduleStats(
                this.currentSchedule,
                Object.keys(this.currentSchedule),
                this.currentManpowerAnalysis
            );
            config.manpowerAnalysis = this.currentManpowerAnalysis;
            // 同步保存当前大夜配置规则快照与排班周期
            config.nightShiftConfig = NightShiftConfigRules.getConfig();
            const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
            if (activeSchedulePeriodConfigId && Store.getSchedulePeriodConfig) {
                const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
                if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig) {
                    config.scheduleConfig = {
                        startDate: activeSchedulePeriodConfig.scheduleConfig.startDate,
                        endDate: activeSchedulePeriodConfig.scheduleConfig.endDate,
                        year: activeSchedulePeriodConfig.scheduleConfig.year,
                        month: activeSchedulePeriodConfig.scheduleConfig.month
                    };
                }
            }
            config.updatedAt = new Date().toISOString();

            // 3. 保存到IndexedDB
            await DB.saveNightShiftConfigManagement(config);
            await Store.saveState();

            // 4. 显示成功提示
            updateStatus('✅ 配置校验通过并已保存', 'success');
            alert('✅ 配置校验通过并已成功保存！\n\n大夜排班配置已保存到数据库。');

            // 5. 检查是否有未保存的修改
            if (this.configModified) {
                // 显示保存成功提示
                this.configModified = false;
                updateStatus('✅ 修改已保存', 'success');
            }

        } catch (error) {
            console.error('[NightShiftManager] 校验并保存失败:', error);
            updateStatus('❌ 保存失败: ' + error.message, 'error');
            alert('❌ 保存失败：' + error.message);
        }
    },

    /**
     * 返回配置列表
     */
    async backToConfigList() {
        await this.showNightShiftManagement();
    },

    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },

    /**
     * 渲染主界面（新的简化界面）
     */
    renderMainView() {
        const container = document.getElementById('nightShiftConfigView');
        if (!container) {
            console.error('[NightShiftManager] 找不到 nightShiftConfigView 容器');
            return;
        }

        // 获取当前排班周期的日期范围
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        const dateRange = {
            startDate: scheduleConfig.startDate || new Date().toISOString().split('T')[0],
            endDate: scheduleConfig.endDate || new Date().toISOString().split('T')[0]
        };

        const html = `
            <div class="p-4 border-b border-gray-200 bg-white">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <h2 class="text-lg font-bold text-gray-800">大夜管理和配置</h2>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="NightShiftManager.handleGenerateSchedule()"
                                class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-bold">
                            生成大夜排班
                        </button>
                        <button onclick="NightShiftManager.showConfigModal()"
                                class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm font-medium">
                            大夜配置管理
                        </button>
                    </div>
                </div>

                <div class="text-xs text-gray-500 mb-2">
                    <p>说明：点击"生成大夜排班"按钮生成当前周期的大夜排班。点击"大夜配置管理"修改配置参数。</p>
                    <p>当前排班周期: ${dateRange.startDate} 至 ${dateRange.endDate}</p>
                </div>
            </div>

            <!-- 结果展示区域 -->
            <div id="nightShiftResults">
                <div class="p-8 text-center text-gray-400 bg-gray-50">
                    <p class="text-lg">请点击"生成大夜排班"按钮开始</p>
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 显示配置管理弹窗
     */
    showConfigModal() {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.id = 'nightShiftConfigModal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // 创建弹窗容器
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 24px;
            min-width: 800px;
            max-width: 1200px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        `;

        // 获取当前配置
        const config = NightShiftConfigRules.getConfig();

        modal.innerHTML = this.renderConfigFormHTML(config);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 绑定事件
        this.bindConfigModalEvents(overlay, modal);
    },

    /**
     * 渲染配置表单HTML（用于弹窗）
     */
    renderConfigFormHTML(config) {
        return `
            <div class="night-shift-config-modal">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">大夜配置管理</h2>
                    <button id="closeConfigModal" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>

                <!-- 地区配置 -->
                <div class="region-config mb-4">
                    <h3 class="text-lg font-semibold mb-3">地区配置</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <!-- 上海配置 -->
                        <div class="border rounded-lg p-4 bg-gray-50">
                            <h4 class="font-semibold mb-2">上海</h4>
                            <div class="space-y-2">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">每日最少人数</label>
                                    <input type="number" id="sh_dailyMin" value="${config.regions.shanghai.dailyMin}" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">每日最大人数</label>
                                    <input type="number" id="sh_dailyMax" value="${config.regions.shanghai.dailyMax}" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">男生连续天数</label>
                                    <input type="number" id="sh_maleConsecutiveDays" value="${config.regions.shanghai.maleConsecutiveDays}" min="3" max="7"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">女生连续天数</label>
                                    <input type="number" id="sh_femaleConsecutiveDays" value="${config.regions.shanghai.femaleConsecutiveDays}" min="3" max="7"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 总约束 -->
                <div class="border rounded-lg p-4 mb-4 bg-gray-50">
                    <h3 class="text-lg font-semibold mb-3">总约束</h3>
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">每天最少总人数</label>
                            <input type="number" id="cross_totalDailyMin" value="${config.crossRegion.totalDailyMin}" min="0" max="5"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">两地每天最大总人数</label>
                            <input type="number" id="cross_totalDailyMax" value="${config.crossRegion.totalDailyMax}" min="2" max="8"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div class="flex items-end">
                            <label class="flex items-center">
                                <input type="checkbox" id="cross_enableBackup" ${config.crossRegion.enableBackup ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">启用跨地区补充</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- 人力计算配置 -->
                <div class="border rounded-lg p-4 mb-4 bg-gray-50">
                    <h3 class="text-lg font-semibold mb-3">人力计算配置</h3>
                    <div class="grid grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">男生每月标准天数</label>
                            <input type="number" id="mp_maleDaysPerMonth" value="${config.manpowerCalculation.maleDaysPerMonth}" min="3" max="7"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">女生每月标准天数</label>
                            <input type="number" id="mp_femaleDaysPerMonth" value="${config.manpowerCalculation.femaleDaysPerMonth}" min="3" max="7"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">富裕阈值</label>
                            <input type="number" id="mp_richThreshold" value="${config.manpowerCalculation.richThreshold}" min="0" max="30"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">不足阈值</label>
                            <input type="number" id="mp_shortageThreshold" value="${config.manpowerCalculation.shortageThreshold}" min="0" max="30"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                    </div>
                </div>

                <!-- 约束规则配置 -->
                <div class="border rounded-lg p-4 mb-4 bg-gray-50">
                    <h3 class="text-lg font-semibold mb-3">约束规则</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="flex items-center">
                                <input type="checkbox" id="con_checkBasicEligibility" ${config.constraints.checkBasicEligibility ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">检查基础条件</span>
                            </label>
                            <label class="flex items-center">
                                <input type="checkbox" id="con_checkMenstrualPeriod" ${config.constraints.checkMenstrualPeriod ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">检查生理期</span>
                            </label>
                            <label class="flex items-center">
                                <input type="checkbox" id="con_checkVacationConflict" ${config.constraints.checkVacationConflict ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">检查休假冲突</span>
                            </label>
                        </div>
                        <div class="space-y-2">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">女生缓冲天数</label>
                                <input type="number" id="con_femaleBufferDays" value="${config.constraints.femaleBufferDays}" min="1" max="7"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">男生缓冲天数</label>
                                <input type="number" id="con_maleBufferDays" value="${config.constraints.maleBufferDays}" min="1" max="7"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">最小连续天数</label>
                                <input type="number" id="con_minConsecutiveDays" value="${config.constraints.minConsecutiveDays}" min="3" max="7"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 严格连续排班配置 -->
                <div class="border rounded-lg p-4 mb-4 bg-gray-50">
                    <h3 class="text-lg font-semibold mb-3">严格连续排班配置</h3>
                    <div class="space-y-3">
                        <label class="flex items-center">
                            <input type="checkbox" id="sc_enabled" ${config.strictContinuous?.enabled ? 'checked' : ''}
                                   class="mr-2 h-4 w-4 text-blue-600">
                            <span class="text-sm font-medium text-gray-700">启用严格连续排班模式</span>
                        </label>
                        <small class="block text-xs text-gray-500 ml-6">启用后，所有大夜排班必须是连续的，绝不打散分配</small>
                        
                        <div id="sc_options" style="${config.strictContinuous?.enabled ? '' : 'display: none;'}" class="ml-6 space-y-3">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">开工率 (rateSch)</label>
                                <input type="number" id="sc_rateSch" 
                                       value="${config.strictContinuous?.rateSch ?? 1.0}"
                                       min="0.1" max="1.0" step="0.1"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                <small class="block text-xs text-gray-500 mt-1">0.0-1.0，用于计算最大开工天数。例如0.8表示80%的天数需要排班</small>
                            </div>
                            <label class="flex items-center">
                                <input type="checkbox" id="sc_isNul" ${config.strictContinuous?.isNul !== false ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">启用精英轮空 (isNul)</span>
                            </label>
                            <small class="block text-xs text-gray-500 ml-6">
                                启用：人力富足时让部分人员完全轮空（目标天数设为0）<br>
                                禁用：人力富足时让部分男生从4天减为3天
                            </small>
                            
                            <!-- 排班后遗症管理配置 -->
                            <div class="border-t pt-3 mt-3">
                                <h4 class="text-sm font-semibold text-gray-800 mb-2">排班后遗症管理</h4>
                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">大夜后强制休整期 (postShiftRestDays)</label>
                                        <input type="number" id="sc_postShiftRestDays" 
                                               value="${config.strictContinuous?.postShiftRestDays ?? 2}"
                                               min="0" max="7" step="1"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                        <small class="block text-xs text-gray-500 mt-1">大夜班结束后，必须连续休息的天数（0-7天）</small>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">最大连休上限 (maxConsecutiveRestLimit)</label>
                                        <input type="number" id="sc_maxConsecutiveRestLimit" 
                                               value="${config.strictContinuous?.maxConsecutiveRestLimit ?? 3}"
                                               min="0" max="10" step="1"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                        <small class="block text-xs text-gray-500 mt-1">员工单次连续休息（包含强制休整+原有请假/生理期）不能超过的天数。0表示从排班周期管理获取</small>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">随机数种子 (randomSeed)</label>
                                        <input type="number" id="sc_randomSeed" 
                                               value="${config.strictContinuous?.randomSeed ?? ''}"
                                               placeholder="留空使用时间戳"
                                               class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                        <small class="block text-xs text-gray-500 mt-1">设置固定随机数种子可生成相同的排班结果。留空则每次生成不同的排班。用于对比不同参数下的排班效果。</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 操作按钮 -->
                <div class="flex justify-end space-x-3 pt-4 border-t">
                    <button id="btnSaveAndClose"
                            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                        保存配置
                    </button>
                    <button id="btnResetAndClose"
                            class="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm font-medium">
                        重置为默认
                    </button>
                    <button id="btnLoadAndClose"
                            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                        从当前配置加载
                    </button>
                    <button id="btnCancel"
                            class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm font-medium">
                        取消
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * 绑定配置弹窗事件
     */
    bindConfigModalEvents(overlay, modal) {
        // 关闭按钮
        const closeBtn = modal.querySelector('#closeConfigModal');
        const cancelBtn = modal.querySelector('#btnCancel');

        const closeModal = () => {
            document.body.removeChild(overlay);
        };

        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;

        // 点击遮罩层关闭
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        };

        // 严格连续排班配置：启用/禁用时显示/隐藏相关选项
        const strictEnabledCheckbox = modal.querySelector('#sc_enabled');
        if (strictEnabledCheckbox) {
            strictEnabledCheckbox.addEventListener('change', (e) => {
                const optionsDiv = modal.querySelector('#sc_options');
                if (optionsDiv) {
                    if (e.target.checked) {
                        optionsDiv.style.display = '';
                    } else {
                        optionsDiv.style.display = 'none';
                    }
                }
            });
        }

        // 保存并关闭
        const saveBtn = modal.querySelector('#btnSaveAndClose');
        saveBtn.onclick = async () => {
            try {
                const config = this.collectConfigFromModal(modal);

                // 验证配置
                const validation = NightShiftConfigRules.validateConfig(config);
                if (!validation.valid) {
                    alert('配置验证失败:\n' + validation.errors.join('\n'));
                    return;
                }

                // 保存配置
                await NightShiftConfigRules.updateConfig(config);
                // 同步到当前配置记录，避免配置快照与全局配置脱节
                if (this.currentConfigId) {
                    const configs = Store.state.nightShiftConfigs || [];
                    const currentConfig = configs.find(c => c.configId === this.currentConfigId);
                    if (currentConfig) {
                        currentConfig.nightShiftConfig = NightShiftConfigRules.getConfig();
                        currentConfig.updatedAt = new Date().toISOString();
                        await DB.saveNightShiftConfigManagement(currentConfig);
                        await Store.saveState();
                    }
                }

                alert('配置已保存');
                closeModal();

                // 重新渲染主界面（如果已有排班结果，可能需要重新渲染）
                if (this.currentSchedule) {
                    this.renderScheduleResults({
                        schedule: this.currentSchedule,
                        stats: this.calculateScheduleStats(
                            this.currentSchedule,
                            Object.keys(this.currentSchedule),
                            this.currentManpowerAnalysis
                        ),
                        manpowerAnalysis: this.currentManpowerAnalysis
                    });
                }
            } catch (error) {
                console.error('[NightShiftManager] 保存配置失败:', error);
                alert('保存配置失败: ' + error.message);
            }
        };

        // 重置并关闭
        const resetBtn = modal.querySelector('#btnResetAndClose');
        resetBtn.onclick = async () => {
            if (!confirm('确定要重置为默认配置吗？')) {
                return;
            }

            try {
                await NightShiftConfigRules.resetToDefault();
                alert('已重置为默认配置');
                closeModal();

                // 重新渲染主界面
                if (this.currentSchedule) {
                    this.renderScheduleResults({
                        schedule: this.currentSchedule,
                        stats: this.calculateScheduleStats(
                            this.currentSchedule,
                            Object.keys(this.currentSchedule),
                            this.currentManpowerAnalysis
                        ),
                        manpowerAnalysis: this.currentManpowerAnalysis
                    });
                }
            } catch (error) {
                console.error('[NightShiftManager] 重置配置失败:', error);
                alert('重置配置失败: ' + error.message);
            }
        };

        // 从当前配置加载并关闭
        const loadBtn = modal.querySelector('#btnLoadAndClose');
        loadBtn.onclick = async () => {
            try {
                await NightShiftConfigRules.loadFromDailyManpowerConfig();
                alert('已从当前排班配置加载');
                closeModal();

                // 重新渲染主界面
                if (this.currentSchedule) {
                    this.renderScheduleResults({
                        schedule: this.currentSchedule,
                        stats: this.calculateScheduleStats(
                            this.currentSchedule,
                            Object.keys(this.currentSchedule),
                            this.currentManpowerAnalysis
                        ),
                        manpowerAnalysis: this.currentManpowerAnalysis
                    });
                }
            } catch (error) {
                console.error('[NightShiftManager] 从当前配置加载失败:', error);
                alert('从当前配置加载失败: ' + error.message);
            }
        };
    },

    /**
     * 从弹窗收集配置
     */
    collectConfigFromModal(modal) {
        return {
            regions: {
                shanghai: {
                    dailyMin: parseInt(modal.querySelector('#sh_dailyMin').value, 10),
                    dailyMax: parseInt(modal.querySelector('#sh_dailyMax').value, 10),
                    maleConsecutiveDays: parseInt(modal.querySelector('#sh_maleConsecutiveDays').value, 10),
                    femaleConsecutiveDays: parseInt(modal.querySelector('#sh_femaleConsecutiveDays').value, 10)
                }
            },
            crossRegion: {
                totalDailyMin: parseInt(modal.querySelector('#cross_totalDailyMin').value, 10),
                totalDailyMax: parseInt(modal.querySelector('#cross_totalDailyMax').value, 10),
                enableBackup: modal.querySelector('#cross_enableBackup').checked
            },
            manpowerCalculation: {
                maleDaysPerMonth: parseInt(modal.querySelector('#mp_maleDaysPerMonth').value, 10),
                femaleDaysPerMonth: parseInt(modal.querySelector('#mp_femaleDaysPerMonth').value, 10),
                richThreshold: parseInt(modal.querySelector('#mp_richThreshold').value, 10),
                shortageThreshold: parseInt(modal.querySelector('#mp_shortageThreshold').value, 10)
            },
            constraints: {
                checkBasicEligibility: modal.querySelector('#con_checkBasicEligibility').checked,
                checkMenstrualPeriod: modal.querySelector('#con_checkMenstrualPeriod').checked,
                checkVacationConflict: modal.querySelector('#con_checkVacationConflict').checked,
                femaleBufferDays: parseInt(modal.querySelector('#con_femaleBufferDays').value, 10),
                maleBufferDays: parseInt(modal.querySelector('#con_maleBufferDays').value, 10),
                minConsecutiveDays: parseInt(modal.querySelector('#con_minConsecutiveDays').value, 10)
            },
            strictContinuous: {
                enabled: modal.querySelector('#sc_enabled').checked,
                rateSch: parseFloat(modal.querySelector('#sc_rateSch').value) || 1.0,
                isNul: modal.querySelector('#sc_isNul').checked,
                postShiftRestDays: parseInt(modal.querySelector('#sc_postShiftRestDays')?.value, 10) || 2,
                maxConsecutiveRestLimit: parseInt(modal.querySelector('#sc_maxConsecutiveRestLimit')?.value, 10) || 3,
                randomSeed: (() => {
                    const seedInput = modal.querySelector('#sc_randomSeed');
                    const seedValue = seedInput ? seedInput.value.trim() : '';
                    return seedValue === '' ? null : (isNaN(parseInt(seedValue, 10)) ? null : parseInt(seedValue, 10));
                })()
            }
        };
    },

    /**
     * 渲染配置表单（已废弃，保留用于向后兼容）
     */
    renderConfigForm() {
        const container = document.getElementById('nightShiftConfigView');
        if (!container) {
            console.error('[NightShiftManager] 找不到大夜配置容器');
            return;
        }

        const config = NightShiftConfigRules.getConfig();

        const html = `
            <div class="night-shift-management">
                <!-- 配置区域 -->
                <div class="config-section">
                    <h2>大夜配置</h2>

                    <!-- 地区配置 -->
                    <div class="region-config">
                        <h3>地区配置</h3>

                        <!-- 上海配置 -->
                        <div class="region-card">
                            <h4>上海</h4>
                            <div class="form-group">
                                <label>每日最少人数:
                                    <input type="number" id="sh_min" value="${config.regions.shanghai.dailyMin}"
                                           min="0" max="5" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>每日最大人数:
                                    <input type="number" id="sh_max" value="${config.regions.shanghai.dailyMax}"
                                           min="0" max="5" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>男生连续天数:
                                    <input type="number" id="sh_male_days" value="${config.regions.shanghai.maleConsecutiveDays}"
                                           min="3" max="7" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>女生连续天数:
                                    <input type="number" id="sh_female_days" value="${config.regions.shanghai.femaleConsecutiveDays}"
                                           min="3" max="7" step="1">
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- 总约束 -->
                    <div class="cross-region-config">
                        <h3>总约束</h3>
                        <div class="form-group">
                            <label>每天最少总人数:
                                <input type="number" id="cross_min" value="${config.crossRegion.totalDailyMin}"
                                       min="0" max="5" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>每天最大总人数:
                                <input type="number" id="cross_max" value="${config.crossRegion.totalDailyMax}"
                                       min="0" max="5" step="1">
                            </label>
                        </div>
                    </div>

                    <!-- 人力计算配置 -->
                    <div class="manpower-config">
                        <h3>人力计算配置</h3>
                        <div class="form-group">
                            <label>男生每月标准大夜天数:
                                <input type="number" id="male_days_per_month" value="${config.manpowerCalculation.maleDaysPerMonth}"
                                       min="3" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>女生每月标准大夜天数:
                                <input type="number" id="female_days_per_month" value="${config.manpowerCalculation.femaleDaysPerMonth}"
                                       min="3" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>富裕阈值（人天数-需求天数）:
                                <input type="number" id="rich_threshold" value="${config.manpowerCalculation.richThreshold}"
                                       min="0" max="30" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>不足阈值:
                                <input type="number" id="shortage_threshold" value="${config.manpowerCalculation.shortageThreshold}"
                                       min="0" max="30" step="1">
                            </label>
                        </div>
                    </div>

                    <!-- 约束规则配置 -->
                    <div class="constraints-config">
                        <h3>约束规则</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="check_basic" ${config.constraints.checkBasicEligibility ? 'checked' : ''}>
                                检查基础条件（年龄、健康等）
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="check_menstrual" ${config.constraints.checkMenstrualPeriod ? 'checked' : ''}>
                                检查生理期（女生）
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="check_vacation" ${config.constraints.checkVacationConflict ? 'checked' : ''}>
                                检查休假冲突
                            </label>
                        </div>
                        <div class="form-group">
                            <label>女生休假后缓冲天数:
                                <input type="number" id="female_buffer" value="${config.constraints.femaleBufferDays}"
                                       min="1" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>男生休假后缓冲天数:
                                <input type="number" id="male_buffer" value="${config.constraints.maleBufferDays}"
                                       min="1" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>最小连续天数:
                                <input type="number" id="min_consecutive" value="${config.constraints.minConsecutiveDays}"
                                       min="3" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="allow_reduce" ${config.constraints.allowMaleReduceTo3Days ? 'checked' : ''}>
                                人力富足时允许男生减少到3天
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="allow_increase" ${config.constraints.allowMaleIncreaseTo5Days ? 'checked' : ''}>
                                人力不足时允许男生增加到5天
                            </label>
                        </div>
                    </div>

                    <!-- 严格连续排班配置 -->
                    <div class="strict-continuous-config">
                        <h3>严格连续排班配置</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="strict_continuous_enabled" ${config.strictContinuous?.enabled ? 'checked' : ''}>
                                启用严格连续排班模式
                            </label>
                            <small class="form-hint">启用后，所有大夜排班必须是连续的，绝不打散分配</small>
                        </div>
                        <div class="form-group" id="strict_continuous_options" style="${config.strictContinuous?.enabled ? '' : 'display: none;'}">
                            <label>开工率 (rateSch):
                                <input type="number" id="strict_continuous_rate_sch" 
                                       value="${config.strictContinuous?.rateSch ?? 1.0}"
                                       min="0.1" max="1.0" step="0.1">
                            </label>
                            <small class="form-hint">0.0-1.0，用于计算最大开工天数。例如0.8表示80%的天数需要排班</small>
                        </div>
                        <div class="form-group" id="strict_continuous_is_nul_options" style="${config.strictContinuous?.enabled ? '' : 'display: none;'}">
                            <label>
                                <input type="checkbox" id="strict_continuous_is_nul" ${config.strictContinuous?.isNul !== false ? 'checked' : ''}>
                                启用精英轮空 (isNul)
                            </label>
                            <small class="form-hint">
                                启用：人力富足时让部分人员完全轮空（目标天数设为0）<br>
                                禁用：人力富足时让部分男生从4天减为3天
                            </small>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="action-buttons">
                        <button id="btnSaveNightShiftConfig" class="btn-secondary">保存配置</button>
                        <button id="btnResetNightShiftConfig" class="btn-secondary">重置为默认</button>
                        <button id="btnLoadFromDailyConfig" class="btn-secondary">从当前配置加载</button>
                        <button id="btnGenerateNightShift" class="btn-primary">生成大夜排班</button>
                    </div>
                </div>

                <!-- 结果展示区域 -->
                <div class="results-section">
                    <h2>排班结果</h2>

                    <!-- 人力分析 -->
                    <div class="manpower-analysis" id="manpowerAnalysis">
                        <h3>人力分析</h3>
                        <div class="stats-placeholder">点击"生成大夜排班"查看人力分析</div>
                    </div>

                    <!-- 排班表格 -->
                    <div class="schedule-table-container">
                        <h3>大夜排班表</h3>
                        <div id="nightShiftTable">
                            <div class="table-placeholder">点击"生成大夜排班"查看排班表</div>
                        </div>
                    </div>

                    <!-- 统计摘要 -->
                    <div class="schedule-summary">
                        <h3>统计摘要</h3>
                        <div id="nightShiftSummary">
                            <div class="summary-placeholder">点击"生成大夜排班"查看统计摘要</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // 绑定事件
        this.bindConfigFormEvents();
    },

    /**
     * 绑定配置表单事件
     */
    bindConfigFormEvents() {
        // 保存配置
        const btnSave = document.getElementById('btnSaveNightShiftConfig');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.handleSaveConfig());
        }

        // 重置配置
        const btnReset = document.getElementById('btnResetNightShiftConfig');
        if (btnReset) {
            btnReset.addEventListener('click', () => this.handleResetConfig());
        }

        // 从当前配置加载
        const btnLoad = document.getElementById('btnLoadFromDailyConfig');
        if (btnLoad) {
            btnLoad.addEventListener('click', () => this.handleLoadFromDailyConfig());
        }

        // 生成大夜排班
        const btnGenerate = document.getElementById('btnGenerateNightShift');
        if (btnGenerate) {
            btnGenerate.addEventListener('click', () => this.handleGenerateSchedule());
        }

        // 严格连续排班配置：启用/禁用时显示/隐藏相关选项
        const strictEnabledCheckbox = document.getElementById('strict_continuous_enabled');
        if (strictEnabledCheckbox) {
            strictEnabledCheckbox.addEventListener('change', (e) => {
                const optionsDiv = document.getElementById('strict_continuous_options');
                const isNulDiv = document.getElementById('strict_continuous_is_nul_options');
                if (optionsDiv && isNulDiv) {
                    if (e.target.checked) {
                        optionsDiv.style.display = '';
                        isNulDiv.style.display = '';
                    } else {
                        optionsDiv.style.display = 'none';
                        isNulDiv.style.display = 'none';
                    }
                }
            });
        }
    },

    /**
     * 加载配置到表单
     * @param {Object} config - 配置对象
     */
    loadConfigToForm(config) {
        // 上海配置
        document.getElementById('sh_min').value = config.regions.shanghai.dailyMin;
        document.getElementById('sh_max').value = config.regions.shanghai.dailyMax;
        document.getElementById('sh_male_days').value = config.regions.shanghai.maleConsecutiveDays;
        document.getElementById('sh_female_days').value = config.regions.shanghai.femaleConsecutiveDays;

        // 总约束配置
        document.getElementById('cross_min').value = config.crossRegion.totalDailyMin;
        document.getElementById('cross_max').value = config.crossRegion.totalDailyMax;

        // 人力计算配置
        document.getElementById('male_days_per_month').value = config.manpowerCalculation.maleDaysPerMonth;
        document.getElementById('female_days_per_month').value = config.manpowerCalculation.femaleDaysPerMonth;
        document.getElementById('rich_threshold').value = config.manpowerCalculation.richThreshold;
        document.getElementById('shortage_threshold').value = config.manpowerCalculation.shortageThreshold;

        // 约束规则配置
        document.getElementById('check_basic').checked = config.constraints.checkBasicEligibility;
        document.getElementById('check_menstrual').checked = config.constraints.checkMenstrualPeriod;
        document.getElementById('check_vacation').checked = config.constraints.checkVacationConflict;
        document.getElementById('female_buffer').value = config.constraints.femaleBufferDays;
        document.getElementById('male_buffer').value = config.constraints.maleBufferDays;
        document.getElementById('min_consecutive').value = config.constraints.minConsecutiveDays;
        document.getElementById('allow_reduce').checked = config.constraints.allowMaleReduceTo3Days;
        document.getElementById('allow_increase').checked = config.constraints.allowMaleIncreaseTo5Days;

        // 严格连续排班配置
        const strictConfig = config.strictContinuous || { enabled: false, rateSch: 1.0, isNul: true };
        const strictEnabledEl = document.getElementById('strict_continuous_enabled');
        const strictRateSchEl = document.getElementById('strict_continuous_rate_sch');
        const strictIsNulEl = document.getElementById('strict_continuous_is_nul');
        const strictOptionsDiv = document.getElementById('strict_continuous_options');
        const strictIsNulDiv = document.getElementById('strict_continuous_is_nul_options');
        
        if (strictEnabledEl) {
            strictEnabledEl.checked = strictConfig.enabled || false;
            // 触发change事件以显示/隐藏相关选项
            strictEnabledEl.dispatchEvent(new Event('change'));
        }
        if (strictRateSchEl) {
            strictRateSchEl.value = strictConfig.rateSch ?? 1.0;
        }
        if (strictIsNulEl) {
            strictIsNulEl.checked = strictConfig.isNul !== false;
        }

        console.log('[NightShiftManager] 配置已加载到表单');
    },

    /**
     * 从表单收集配置
     * @returns {Object} 配置对象
     */
    collectConfigFromForm() {
        return {
            regions: {
                shanghai: {
                    dailyMin: parseInt(document.getElementById('sh_min').value, 10),
                    dailyMax: parseInt(document.getElementById('sh_max').value, 10),
                    maleConsecutiveDays: parseInt(document.getElementById('sh_male_days').value, 10),
                    femaleConsecutiveDays: parseInt(document.getElementById('sh_female_days').value, 10)
                }
            },
            crossRegion: {
                totalDailyMin: parseInt(document.getElementById('cross_min').value, 10),
                totalDailyMax: parseInt(document.getElementById('cross_max').value, 10),
                enableBackup: false
            },
            manpowerCalculation: {
                maleDaysPerMonth: parseInt(document.getElementById('male_days_per_month').value, 10),
                femaleDaysPerMonth: parseInt(document.getElementById('female_days_per_month').value, 10),
                richThreshold: parseInt(document.getElementById('rich_threshold').value, 10),
                shortageThreshold: parseInt(document.getElementById('shortage_threshold').value, 10)
            },
            constraints: {
                checkBasicEligibility: document.getElementById('check_basic').checked,
                checkMenstrualPeriod: document.getElementById('check_menstrual').checked,
                checkVacationConflict: document.getElementById('check_vacation').checked,
                femaleBufferDays: parseInt(document.getElementById('female_buffer').value, 10),
                maleBufferDays: parseInt(document.getElementById('male_buffer').value, 10),
                minConsecutiveDays: parseInt(document.getElementById('min_consecutive').value, 10),
                allowMaleReduceTo3Days: document.getElementById('allow_reduce').checked,
                allowMaleIncreaseTo5Days: document.getElementById('allow_increase').checked
            },
            strictContinuous: {
                enabled: document.getElementById('strict_continuous_enabled').checked,
                rateSch: parseFloat(document.getElementById('strict_continuous_rate_sch').value) || 1.0,
                isNul: document.getElementById('strict_continuous_is_nul').checked
            }
        };
    },

    /**
     * 处理保存配置
     */
    async handleSaveConfig() {
        try {
            const config = this.collectConfigFromForm();

            // 验证配置
            const validation = NightShiftConfigRules.validateConfig(config);
            if (!validation.valid) {
                alert('配置验证失败:\n' + validation.errors.join('\n'));
                return;
            }

            // 更新配置
            await NightShiftConfigRules.updateConfig(config);

            alert('配置已保存');
        } catch (error) {
            console.error('[NightShiftManager] 保存配置失败:', error);
            alert('保存配置失败: ' + error.message);
        }
    },

    /**
     * 处理重置配置
     */
    async handleResetConfig() {
        try {
            if (!confirm('确定要重置为默认配置吗？')) {
                return;
            }

            await NightShiftConfigRules.resetToDefault();
            const defaultConfig = NightShiftConfigRules.getConfig();
            this.loadConfigToForm(defaultConfig);

            alert('已重置为默认配置');
        } catch (error) {
            console.error('[NightShiftManager] 重置配置失败:', error);
            alert('重置配置失败: ' + error.message);
        }
    },

    /**
     * 处理从当前配置加载
     */
    async handleLoadFromDailyConfig() {
        try {
            await NightShiftConfigRules.loadFromDailyManpowerConfig();
            const updatedConfig = NightShiftConfigRules.getConfig();
            this.loadConfigToForm(updatedConfig);

            alert('已从当前排班配置加载');
        } catch (error) {
            console.error('[NightShiftManager] 从当前配置加载失败:', error);
            alert('从当前配置加载失败: ' + error.message);
        }
    },

    /**
     * 处理生成大夜排班
     */
    async handleGenerateSchedule() {
        try {
            await this.ensureActiveRequestConfigLoaded();
            // 获取当前排班周期的日期范围（从Store或ScheduleLockManager）
            let dateRange;

            // 方法1：优先使用激活的排班周期配置
            const activeConfigId = Store.getState('activeSchedulePeriodConfigId');
            if (activeConfigId && Store.getSchedulePeriodConfig) {
                const activeConfig = Store.getSchedulePeriodConfig(activeConfigId);
                if (activeConfig && activeConfig.scheduleConfig) {
                    dateRange = {
                        startDate: activeConfig.scheduleConfig.startDate,
                        endDate: activeConfig.scheduleConfig.endDate
                    };
                    console.log('[NightShiftManager] 使用激活的排班周期配置:', dateRange);
                }
            }

            // 方法2：从Store获取当前scheduleConfig
            if (!dateRange) {
                const scheduleConfig = Store.getState('scheduleConfig');
                if (scheduleConfig && scheduleConfig.startDate && scheduleConfig.endDate) {
                    dateRange = {
                        startDate: scheduleConfig.startDate,
                        endDate: scheduleConfig.endDate
                    };
                    console.log('[NightShiftManager] 使用Store中的scheduleConfig:', dateRange);
                }
            }

            // 方法3：如果还是没有，使用默认计算（当前月）
            if (!dateRange) {
                const today = new Date();
                const year = today.getFullYear();
                const month = today.getMonth() + 1;
                const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
                dateRange = {
                    startDate: firstDay,
                    endDate: lastDay
                };
                console.log('[NightShiftManager] 使用默认计算的日期范围:', dateRange);
            }

            // 生成排班
            const result = await this.generateNightShiftSchedule(dateRange);

            // 渲染结果
            this.renderScheduleResults(result);

            // 诊断：检查1001号员工未排班原因
            this.logStaffNightShiftExclusionIfNeeded('1001', dateRange, result.schedule);

            // 显示成功信息（包含诊断数据）
            this.showGenerationResult(result, dateRange);

            alert('大夜排班生成成功！');
        } catch (error) {
            console.error('[NightShiftManager] 生成大夜排班失败:', error);
            alert('生成大夜排班失败: ' + error.message);
        }
    },

    /**
     * 显示生成结果和诊断信息
     * @param {Object} result - 排班生成结果
     * @param {Object} dateRange - 日期范围
     */
    showGenerationResult(result, dateRange) {
        // 获取诊断信息
        const solverExists = typeof NightShiftSolver !== 'undefined';
        const solverMode = solverExists ? NightShiftSolver.algorithmMode : 'undefined';
        const incrementalSolverExists = typeof IncrementalNightShiftSolver !== 'undefined';
        const useIncremental = solverExists &&
                               NightShiftSolver.algorithmMode === 'incremental' &&
                               incrementalSolverExists;

        // 创建诊断面板
        const diagnosticPanel = document.createElement('div');
        diagnosticPanel.className = 'fixed top-4 right-4 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50';
        diagnosticPanel.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-bold text-gray-800">大夜排班生成诊断</h3>
                <button onclick="this.parentElement.parentElement.remove()" class="text-gray-500 hover:text-gray-700">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between py-2 border-b">
                    <span class="text-gray-600">使用的算法:</span>
                    <span class="font-medium ${useIncremental ? 'text-green-600' : 'text-orange-600'}">
                        ${useIncremental ? 'IncrementalNightShiftSolver' : 'Legacy 算法'}
                    </span>
                </div>
                <div class="flex justify-between py-2 border-b">
                    <span class="text-gray-600">NightShiftSolver:</span>
                    <span class="${solverExists ? 'text-green-600' : 'text-red-600'}">
                        ${solverExists ? '已加载' : '未加载'}
                    </span>
                </div>
                <div class="flex justify-between py-2 border-b">
                    <span class="text-gray-600">algorithmMode:</span>
                    <span class="font-medium">${solverMode}</span>
                </div>
                <div class="flex justify-between py-2 border-b">
                    <span class="text-gray-600">IncrementalNightShiftSolver:</span>
                    <span class="${incrementalSolverExists ? 'text-green-600' : 'text-red-600'}">
                        ${incrementalSolverExists ? '已加载' : '未加载'}
                    </span>
                </div>
                <div class="flex justify-between py-2 border-b">
                    <span class="text-gray-600">最终判断结果:</span>
                    <span class="font-medium ${useIncremental ? 'text-green-600' : 'text-orange-600'}">
                        ${useIncremental ? '使用增量算法' : '使用Legacy算法'}
                    </span>
                </div>
                <div class="mt-3 pt-2 border-t text-xs text-gray-500">
                    <p>日期范围: ${dateRange.startDate} 至 ${dateRange.endDate}</p>
                    <p>总夜班数: ${result.stats?.totalNightShifts || 0}</p>
                    <p>生成时间: ${new Date().toLocaleTimeString()}</p>
                </div>
            </div>
        `;

        // 添加到页面
        document.body.appendChild(diagnosticPanel);

        // 5秒后自动消失
        setTimeout(() => {
            if (diagnosticPanel.parentElement) {
                diagnosticPanel.remove();
            }
        }, 10000);
    },

    /**
     * 确保已激活的个性化休假配置被加载到工作状态
     */
    async ensureActiveRequestConfigLoaded() {
        try {
            const activeRequestConfigId = Store.getState('activeRequestConfigId');
            if (!activeRequestConfigId || !Store.getRequestConfig || !Store.setActiveRequestConfig) {
                return;
            }

            const activeConfig = Store.getRequestConfig(activeRequestConfigId);
            if (!activeConfig) {
                return;
            }

            // 如果当前 personalRequests 为空，或明显未加载到激活配置，进行同步
            const currentRequests = Store.state.personalRequests || {};
            const hasCurrentRequests = Object.keys(currentRequests).length > 0;
            const snapshotRequests = activeConfig.personalRequestsSnapshot || {};
            const snapshotHasRequests = Object.keys(snapshotRequests).length > 0;

            if ((!hasCurrentRequests && snapshotHasRequests) || !snapshotHasRequests) {
                await Store.setActiveRequestConfig(activeRequestConfigId);
                console.log('[NightShiftManager] 已同步激活的休假配置到工作状态');
            }
        } catch (error) {
            console.warn('[NightShiftManager] 同步激活休假配置失败:', error);
        }
    },

    /**
     * 诊断指定员工未排大夜的原因（仅在未排班时输出）
     * @param {string} staffId
     * @param {Object} dateRange
     * @param {Object} schedule
     */
    logStaffNightShiftExclusionIfNeeded(staffId, dateRange, schedule) {
        try {
            if (!staffId || !dateRange || !schedule) {
                return;
            }

            const allStaff = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];
            const staff = allStaff.find(s => this.getStaffId(s) === staffId);
            if (!staff) {
                console.warn(`[NightShiftDebug] 未找到员工 ${staffId}`);
                return;
            }

            // 统计是否已被分配
            let assignedDays = 0;
            Object.values(schedule).forEach(daySchedule => {
                if (daySchedule.some(s => s.staffId === staffId)) {
                    assignedDays++;
                }
            });

            if (assignedDays > 0) {
                return;
            }

            // 判断地区匹配（仅上海）
            const inShanghai = this.getStaffByRegion('shanghai').some(s => this.getStaffId(s) === staffId);
            if (!inShanghai) {
                console.warn(`[NightShiftDebug] 员工 ${staffId} 未匹配上海地区，请检查归属地/工作地点字段`);
            }

            // 基础可排检查
            if (!this.canDoNightShift(staff)) {
                const rawFlag = staff.canNightShift;
                const normalizedFlag = typeof rawFlag === 'string' ? rawFlag.trim().toLowerCase() : rawFlag;
                console.warn(`[NightShiftDebug] 员工 ${staffId} 不满足基础可排条件（canNightShift/孕产/哺乳）`);
                console.warn('[NightShiftDebug] 基础条件详情:', {
                    canNightShift: rawFlag,
                    canNightShiftNormalized: normalizedFlag,
                    isPregnant: staff.isPregnant,
                    pregnant: staff.pregnant,
                    isLactating: staff.isLactating,
                    lactating: staff.lactating,
                    gender: staff.gender,
                    location: staff.location,
                    workplace: staff.workplace,
                    workLocation: staff.workLocation
                });
            }

            // 按日期统计不可排原因
            const reasonCounts = {};
            const reasonSamples = {};
            const dateList = this.getDateList(dateRange);
            dateList.forEach(dateStr => {
                const regionKey = inShanghai ? 'shanghai' : null;
                if (!regionKey) return;
                const result = this.checkEligibility(staff, dateStr, regionKey, dateRange);
                if (!result.eligible) {
                    reasonCounts[result.reason] = (reasonCounts[result.reason] || 0) + 1;
                    if (!reasonSamples[result.reason]) {
                        reasonSamples[result.reason] = result.details || {};
                    }
                }
            });

            console.warn(`[NightShiftDebug] 员工 ${staffId} 未排班原因统计:`, reasonCounts);
            console.warn(`[NightShiftDebug] 员工 ${staffId} 未排班原因示例:`, reasonSamples);
        } catch (error) {
            console.warn('[NightShiftDebug] 诊断失败:', error);
        }
    },

    /**
     * 渲染排班结果
     * @param {Object} result - 排班结果（可选，默认使用当前结果）
     */
    renderScheduleResults(result = null) {
        if (!result && this.currentSchedule) {
            result = {
                schedule: this.currentSchedule,
                stats: this.calculateScheduleStats(
                    this.currentSchedule,
                    Object.keys(this.currentSchedule),
                    this.currentManpowerAnalysis
                ),
                manpowerAnalysis: this.currentManpowerAnalysis
            };
        }

        if (!result) {
            console.warn('[NightShiftManager] 没有可用的排班结果');
            return;
        }

        const resultsContainer = document.getElementById('nightShiftResults');
        if (!resultsContainer) {
            console.error('[NightShiftManager] 找不到 nightShiftResults 容器');
            return;
        }

        let html = '';

        // 第一：大夜排班表
        html += '<div class="mb-6">';
        html += '<h3 class="text-lg font-semibold text-gray-800 mb-3">大夜排班表</h3>';
        html += '<div id="nightShiftTableContainer"></div>';
        html += '</div>';

        // 第二：人力分析
        html += '<div class="mb-6">';
        html += '<h3 class="text-lg font-semibold text-gray-800 mb-3">人力分析</h3>';
        html += '<div id="manpowerAnalysisContainer"></div>';
        html += '</div>';

        // 第三：个人夜班天数排行（前10）
        html += '<div class="mb-6">';
        html += '<h3 class="text-lg font-semibold text-gray-800 mb-3">个人夜班天数排行（前10）</h3>';
        html += '<div id="staffRankingContainer"></div>';
        html += '</div>';

        resultsContainer.innerHTML = html;

        // 渲染各个部分
        this.renderScheduleTableInResults(result.schedule);
        this.renderManpowerAnalysisInResults(result.manpowerAnalysis);
        this.renderStaffRankingInResults(result.stats);
    },

    /**
     * 渲染人力分析
     * @param {Object} manpowerAnalysis - 人力分析结果
     */
    renderManpowerAnalysis(manpowerAnalysis) {
        const container = document.getElementById('manpowerAnalysis');
        if (!container) return;

        if (!manpowerAnalysis || !manpowerAnalysis.shanghai) {
            container.innerHTML = '<div class="stats-placeholder">暂无人力分析数据</div>';
            return;
        }

        const sh = manpowerAnalysis.shanghai;

        const html = `
            <h3>人力分析</h3>
            <div class="stats-grid">
                <div class="stats-card">
                    <h4>上海</h4>
                    <div class="stat-item">男生人数: <span>${sh.totalMales}</span></div>
                    <div class="stat-item">女生人数: <span>${sh.totalFemales}</span></div>
                    <div class="stat-item">总供给人天数: <span>${sh.totalSupply}</span></div>
                    <div class="stat-item">总需求人天数: <span>${sh.totalDemand}</span></div>
                    <div class="stat-item">富裕/不足: <span class="${sh.surplus >= 0 ? 'positive' : 'negative'}">${sh.surplus >= 0 ? '+' : ''}${sh.surplus}人天</span></div>
                    <div class="stat-item">人力状态: <span class="${sh.isSufficient ? 'sufficient' : 'insufficient'}">${sh.isSufficient ? '富足' : '不足'}</span></div>
                    <div class="stat-item">调整策略: <span>${this.getStrategyName(sh.adjustmentStrategy)}</span></div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 获取策略名称
     * @param {string} strategy - 策略代码
     * @returns {string} 策略名称
     */
    getStrategyName(strategy) {
        const names = {
            'normal': '正常',
            'reduce': '男生减少天数（4→3天）',
            'increase': '男生增加天数（4→5天）'
        };
        return names[strategy] || strategy;
    },

    /**
     * 获取地区显示名称
     * @param {string} region - 地区代码（支持多种格式）
     * @returns {string} 地区显示名称
     */
    getRegionDisplayName(region) {
        // 标准化地区代码：处理各种可能的输入格式
        if (!region) return '未知';

        const normalized = String(region).toLowerCase().trim();

        // 支持多种格式：英文代码、中文名称、拼音缩写等
        const regionMap = {
            'shanghai': '上海',
            '上海': '上海',
            'sh': '上海',
            '沪': '上海',
            'SH': '上海'
        };

        return regionMap[normalized] || region;
    },

    /**
     * 计算特殊节假日连休标志
     * @param {Array} dateInfoList - 日期信息列表
     * @param {Object} restDays - 休息日快照
     * @returns {Set} 连通到特殊节假日的日期集合
     */
    calculateConnectedToSpecial(dateInfoList, restDays) {
        // 1. 构建特殊节假日集合
        const specialSet = new Set();
        dateInfoList.forEach(dateInfo => {
            const holidayName = dateInfo.holidayName || '';
            const isFixedHoliday = typeof HolidayManager !== 'undefined'
                ? HolidayManager.isFixedHoliday(dateInfo.dateStr)
                : false;
            const lunarHoliday = typeof LunarHolidays !== 'undefined'
                ? LunarHolidays.getHoliday(dateInfo.dateStr)
                : null;

            if (holidayName || isFixedHoliday || lunarHoliday) {
                specialSet.add(dateInfo.dateStr);
            }
        });

        // 2. 计算休息日标志
        const restFlags = dateInfoList.map((dateInfo) => {
            const dateStr = dateInfo.dateStr;
            const isWeekend = dateInfo.isWeekend;
            const hasOverride = Object.prototype.hasOwnProperty.call(restDays, dateStr);
            return hasOverride ? restDays[dateStr] === true : isWeekend;
        });

        // 3. 计算特殊节假日标志
        const specialFlags = dateInfoList.map(dateInfo => specialSet.has(dateInfo.dateStr));

        // 4. 计算连通性（左右传播算法）
        const connectedToSpecial = new Array(dateInfoList.length).fill(false);

        // 标记特殊节假日自身
        specialFlags.forEach((v, idx) => {
            if (v) connectedToSpecial[idx] = true;
        });

        // 左到右传播
        for (let i = 1; i < dateInfoList.length; i++) {
            if (restFlags[i] && (connectedToSpecial[i - 1] || specialFlags[i - 1])) {
                connectedToSpecial[i] = true;
            }
        }

        // 右到左传播
        for (let i = dateInfoList.length - 2; i >= 0; i--) {
            if (restFlags[i] && (connectedToSpecial[i + 1] || specialFlags[i + 1])) {
                connectedToSpecial[i] = true;
            }
        }

        // 返回连通日期集合
        const connectedSet = new Set();
        dateInfoList.forEach((dateInfo, idx) => {
            if (connectedToSpecial[idx]) {
                connectedSet.add(dateInfo.dateStr);
            }
        });

        return connectedSet;
    },

    /**
     * 切换大夜排班（用于点击单元格交互）
     * 支持三种状态循环切换：空白 -> 大夜 -> 休整期 -> 空白
     * @param {string} staffId - 员工ID
     * @param {string} dateStr - 日期字符串
     */
    async toggleNightShiftAssignment(staffId, dateStr) {
        // 检查是否已生成排班
        if (!this.currentSchedule) {
            alert('⚠️ 请先生成大夜排班，然后再进行修改。');
            return;
        }

        // 检查该员工在该日期是否有休假配置
        const personalRequests = Store.getAllPersonalRequests();
        const staffVacations = personalRequests[staffId] || {};
        if (staffVacations[dateStr]) {
            alert('⚠️ 该员工在此日期已配置休假，无法排大夜。');
            return;
        }

        // 获取该日期的排班
        if (!this.currentSchedule[dateStr]) {
            this.currentSchedule[dateStr] = [];
        }

        const daySchedule = this.currentSchedule[dateStr];
        const existingIndex = daySchedule.findIndex(s => s.staffId === staffId);

        if (existingIndex !== -1) {
            const existing = daySchedule[existingIndex];
            const shiftType = existing.shiftType || 'night';

            // 三态切换逻辑
            if (shiftType === 'night') {
                // 大夜 -> 休整期
                existing.shiftType = 'rest';
                existing.isPostShiftRest = true;
                existing.isAutoGenerated = false; // 手动添加的休整期
                console.log(`[NightShiftManager] 切换: ${staffId} - ${dateStr} 大夜 -> 休整期`);
            } else if (shiftType === 'rest') {
                // 休整期 -> 空白（移除）
                daySchedule.splice(existingIndex, 1);
                console.log(`[NightShiftManager] 切换: ${staffId} - ${dateStr} 休整期 -> 空白`);
            } else {
                // 未知类型 -> 空白（移除）
                daySchedule.splice(existingIndex, 1);
                console.log(`[NightShiftManager] 移除未知类型: ${staffId} - ${dateStr}`);
            }
        } else {
            // 空白 -> 大夜
            // 获取员工信息
            const staffData = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];
            const staff = staffData.find(s => String(s.staffId || s.id) === String(staffId));

            daySchedule.push({
                staffId: staffId,
                name: staff ? staff.name : '',
                gender: staff ? staff.gender : '',
                region: staff ? staff.location || 'shanghai' : 'shanghai',
                date: dateStr,
                shiftType: 'night',
                isAutoGenerated: false // 手动添加
            });
            console.log(`[NightShiftManager] 添加大夜: ${staffId} - ${dateStr}`);
        }

        // 标记配置为已修改
        this.configModified = true;

        // 重新渲染表格
        this.renderScheduleTableInResults(this.currentSchedule);

        // 显示提示
        updateStatus('✅ 排班已临时修改，请点击"校验并保存"按钮保存更改', 'success');
    },

    /**
     * 处理列排序（降序 → 升序 → 复原）
     * @param {string} columnKey - 列键（如 'staffId', 'name', '2024-12-01'）
     * @param {string} columnType - 列类型（'staff' 或 'date'）
     */
    handleSort(columnKey, columnType) {
        // 初始化排序状态
        if (!this.currentSortState) {
            this.currentSortState = {};
        }

        // 获取当前排序状态
        const currentState = this.currentSortState[columnKey] || 'none'; // 'none', 'desc', 'asc'

        // 计算下一个状态
        let nextState;
        if (currentState === 'none') {
            nextState = 'desc';
        } else if (currentState === 'desc') {
            nextState = 'asc';
        } else {
            nextState = 'none';
        }

        // 更新排序状态
        this.currentSortState[columnKey] = nextState;
        this.currentSortColumn = { key: columnKey, type: columnType, state: nextState };

        // 重新渲染表格
        this.renderScheduleTableInResults();

        console.log(`[NightShiftManager] 列排序: ${columnKey} (${columnType}) -> ${nextState}`);
    },

    /**
     * 根据排班状态对员工数据进行排序
     * @param {Array} staffData - 员工数据列表
     * @param {string} columnKey - 列键
     * @param {string} sortState - 排序状态（'desc', 'asc', 'none'）
     * @returns {Array} 排序后的员工数据
     */
    sortStaffData(staffData, columnKey, sortState) {
        if (sortState === 'none') {
            // 恢复原始排序（按 staffId）
            return staffData.sort((a, b) => {
                const idA = String(a.staffId || a.id || '');
                const idB = String(b.staffId || b.id || '');
                return idA.localeCompare(idB, undefined, { numeric: true });
            });
        }

        // 判断列类型
        const isDateColumn = /^\d{4}-\d{2}-\d{2}$/.test(columnKey);

        if (isDateColumn) {
            // 日期列：根据该日期的排班状态排序
            return staffData.sort((a, b) => {
                const schedule = this.currentSchedule[columnKey] || [];
                const aHasNight = schedule.some(s => s.staffId === a.staffId);
                const bHasNight = schedule.some(s => s.staffId === b.staffId);

                // 有大夜的排前面或后面
                const compareValue = (aHasNight === bHasNight) ? 0 : (aHasNight ? 1 : -1);
                return sortState === 'desc' ? compareValue : -compareValue;
            });
        } else {
            // 固定列：根据字段值排序
            return staffData.sort((a, b) => {
                let aValue, bValue;

                switch (columnKey) {
                    case 'staffId':
                        aValue = String(a.staffId || a.id || '');
                        bValue = String(b.staffId || b.id || '');
                        break;
                    case 'name':
                        aValue = String(a.name || '');
                        bValue = String(b.name || '');
                        break;
                    case 'gender':
                        aValue = String(a.gender || '未知');
                        bValue = String(b.gender || '未知');
                        break;
                    case 'personType':
                        aValue = String(a.personType || '未设置');
                        bValue = String(b.personType || '未设置');
                        break;
                    case 'region':
                        aValue = String(a.region || '');
                        bValue = String(b.region || '');
                        break;
                    case 'nightShiftCount':
                        // 计算排了大夜的天数
                        aValue = this.calculateNightShiftCount(a.staffId);
                        bValue = this.calculateNightShiftCount(b.staffId);
                        break;
                    default:
                        return 0;
                }

                // 数值比较
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    const compareValue = aValue - bValue;
                    return sortState === 'desc' ? -compareValue : compareValue;
                }

                // 字符串比较
                const compareValue = aValue.localeCompare(bValue, 'zh-CN');
                return sortState === 'desc' ? -compareValue : compareValue;
            });
        }
    },

    /**
     * 获取表头排序图标
     * @param {string} columnKey - 列键
     * @returns {string} 排序图标HTML
     */
    getHeaderSortIcon(columnKey) {
        if (!this.currentSortColumn || this.currentSortColumn.key !== columnKey) {
            return ''; // 无排序状态
        }

        const state = this.currentSortColumn.state;
        if (state === 'desc') {
            return '<span class="ml-1 text-xs">↓</span>';
        } else if (state === 'asc') {
            return '<span class="ml-1 text-xs">↑</span>';
        }

        return '';
    },

    /**
     * 获取休假的显示配置
     * @param {string} vacationType - 休假类型 ("ANNUAL", "LEGAL", "REQ")
     * @returns {Object} 显示配置对象
     */
    getVacationDisplayConfig(vacationType) {
        const configs = {
            'ANNUAL': {
                text: '年',
                bgClass: 'bg-blue-200',
                textClass: 'text-blue-900',
                borderClass: 'border-blue-300',
                tooltip: '年假（已配置个性化休假）'
            },
            'LEGAL': {
                text: '法',
                bgClass: 'bg-green-200',
                textClass: 'text-green-900',
                borderClass: 'border-green-300',
                tooltip: '法定休（已配置个性化休假）'
            },
            'REQ': {
                text: '休',
                bgClass: 'bg-gray-200',
                textClass: 'text-gray-700',
                borderClass: 'border-gray-300',
                tooltip: '自动判断（已配置个性化休假）'
            }
        };

        return configs[vacationType] || configs['REQ'];
    },

    /**
     * 渲染排班单元格（支持大夜、休整期和休假显示）
     * @param {Object|null} assignment - 大夜排班信息
     * @param {string|undefined} vacationType - 休假类型
     * @param {string} dateStr - 日期字符串
     * @param {string} staffId - 员工ID
     * @param {boolean} canDoNightShift - 是否可以排大夜
     * @returns {string} HTML字符串
     */
    renderScheduleCell(assignment, vacationType, dateStr, staffId, canDoNightShift = true) {
        let cellContent = '';
        let cellClass = 'px-0.5 py-1 text-center text-xs border border-gray-300';
        let tooltip = dateStr;
        let onclick = '';
        let isDisabled = false;

        // 如果员工不可排大夜，标记为禁用状态（但仍显示休假信息）
        if (canDoNightShift === false) {
            isDisabled = true;
            cellClass += ' bg-gray-200 cursor-not-allowed opacity-60';
            tooltip += '\n不可排大夜（哺乳期/孕妇/其他限制）';
        }

        // 优先级：休假 > 大夜 > 休整期 > 空闲
        if (vacationType) {
            // 显示休假配置（与个性化休假页面一致的颜色）
            const displayConfig = this.getVacationDisplayConfig(vacationType);
            cellContent = displayConfig.text;

            if (isDisabled) {
                // 不可排大夜的员工，休假信息也置灰
                cellClass += ` ${displayConfig.bgClass} ${displayConfig.textClass} ${displayConfig.borderClass} font-semibold opacity-60`;
            } else {
                cellClass += ` ${displayConfig.bgClass} ${displayConfig.textClass} ${displayConfig.borderClass} font-semibold`;
            }

            tooltip += `\n${displayConfig.tooltip}`;
            if (isDisabled) {
                tooltip += '\n（不可排大夜，仅显示休假信息）';
            }
        } else if (assignment) {
            // 判断是大夜还是休整期
            const shiftType = assignment.shiftType || 'night';
            const isPostShiftRest = assignment.isPostShiftRest || false;

            if (shiftType === 'rest' || isPostShiftRest) {
                // 显示休整期（绿底白字）
                cellContent = '休整';
                if (isDisabled) {
                    cellClass += ' bg-green-600 text-green-200 font-semibold opacity-60';
                    tooltip += '\n大夜后休整期（不可排大夜员工，仅显示）';
                } else {
                    cellClass += ' bg-green-500 text-white font-semibold cursor-pointer hover:bg-green-600';
                    tooltip += '\n大夜后休整期（点击切换）';
                    onclick = `onclick="NightShiftManager.toggleNightShiftAssignment('${staffId}', '${dateStr}')"`;
                }
            } else {
                // 显示大夜排班（黑底白字）
                // 注意：不可排大夜的员工不应该有大夜排班，但为了安全起见，仍然处理
                cellContent = '大夜';
                if (isDisabled) {
                    cellClass += ' bg-gray-600 text-gray-300 font-semibold opacity-60';
                    tooltip += '\n大夜排班（不可排大夜员工，仅显示）';
                } else {
                    cellClass += ' bg-gray-900 text-white font-semibold cursor-pointer hover:bg-gray-800';
                    tooltip += '\n大夜排班（点击切换）';
                    onclick = `onclick="NightShiftManager.toggleNightShiftAssignment('${staffId}', '${dateStr}')"`;
                }
            }
        } else {
            // 空闲
            if (isDisabled) {
                cellClass += ' bg-gray-100 text-gray-400';
                cellContent = '-';
                tooltip += '\n未排班（不可排大夜）';
            } else {
                cellClass += ' bg-white hover:bg-gray-100 cursor-pointer';
                tooltip += '\n未排班（点击添加大夜）';
                onclick = `onclick="NightShiftManager.toggleNightShiftAssignment('${staffId}', '${dateStr}')"`;
            }
        }

        return `<td class="${cellClass}" title="${tooltip}" ${onclick}>${cellContent}</td>`;
    },

    /**
     * 渲染排班表格（在结果区域，格式与个性化需求页面一致）
     * @param {Object} schedule - 排班表
     */
    renderScheduleTableInResults(schedule) {
        const container = document.getElementById('nightShiftTableContainer');
        if (!container) {
            console.error('[NightShiftManager] 找不到 nightShiftTableContainer 容器');
            return;
        }

        if (!schedule) {
            container.innerHTML = '<div class="stats-placeholder">暂无排班结果</div>';
            return;
        }

        console.log('[NightShiftManager] renderScheduleTableInResults 开始渲染');
        console.log('[NightShiftManager] 原始 schedule 数据:', schedule);

        // 获取员工数据
        const staffData = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];
        console.log('[NightShiftManager] 员工数据数量:', staffData.length);

        // 获取激活的个性化休假配置
        const personalRequests = Store.getAllPersonalRequests();
        console.log('[NightShiftManager] 个性化休假配置:', personalRequests);

        // 获取排班周期配置（用于判断特殊节假日连休和休息日）
        let schedulePeriodConfig = null;
        let restDaysSnapshot = {};
        
        // 优先从激活的排班周期配置获取
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (activeSchedulePeriodConfigId) {
            schedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            if (schedulePeriodConfig && schedulePeriodConfig.restDaysSnapshot) {
                restDaysSnapshot = schedulePeriodConfig.restDaysSnapshot;
                console.log('[NightShiftManager] 从激活的排班周期配置获取休息日配置，共', Object.keys(restDaysSnapshot).length, '天');
            }
        }
        
        // 如果激活的配置没有，尝试从当前大夜配置关联的排班周期配置获取
        if (!schedulePeriodConfig && this.currentConfigId) {
            const configs = Store.state.nightShiftConfigs || [];
            const config = configs.find(c => c.configId === this.currentConfigId);
            if (config && config.schedulePeriodConfigId) {
                schedulePeriodConfig = Store.getSchedulePeriodConfig(config.schedulePeriodConfigId);
                if (schedulePeriodConfig && schedulePeriodConfig.restDaysSnapshot) {
                    restDaysSnapshot = schedulePeriodConfig.restDaysSnapshot;
                    console.log('[NightShiftManager] 从大夜配置关联的排班周期配置获取休息日配置');
                }
            }
        }

        // 【关键修复】检测schedule格式
        // 格式1: { dateStr: [assignments] } - NightShiftManager直接生成的格式
        // 格式2: { staffId: { dateStr: 'NIGHT' } } - NightShiftSolver返回的格式

        const firstKey = Object.keys(schedule)[0];
        const isDateFormat = firstKey && schedule[firstKey] instanceof Array;

        console.log('[NightShiftManager] schedule 数据格式:', isDateFormat ? '按日期组织 { dateStr: [] }' : '按员工组织 { staffId: {} }');

        let transformedSchedule;
        let transformedDates;

        if (isDateFormat) {
            // 已经是按日期组织的格式，直接使用
            transformedSchedule = schedule;
            transformedDates = Object.keys(transformedSchedule).sort();
        } else {
            // 需要转换：从 { staffId: { dateStr: 'NIGHT' } } 转换为 { dateStr: [assignments] }
            transformedSchedule = {};
            Object.keys(schedule).forEach(staffId => {
                const staffSchedule = schedule[staffId];
                Object.keys(staffSchedule).forEach(dateStr => {
                    if (staffSchedule[dateStr] === 'NIGHT') {
                        if (!transformedSchedule[dateStr]) {
                            transformedSchedule[dateStr] = [];
                        }

                        // 从staffData中查找员工信息
                        const staff = staffData.find(s => (s.staffId || s.id) === staffId);

                        // 即使找不到员工信息，也要添加基本数据
                        transformedSchedule[dateStr].push({
                            staffId: staffId,
                            name: staff ? (staff.name || '') : `员工${staffId}`,
                            gender: staff ? (staff.gender || '') : '',
                            region: staff ? (staff.location || staff.region || '') : ''
                        });
                    }
                });
            });

            transformedDates = Object.keys(transformedSchedule).sort();
        }

        console.log('[NightShiftManager] 转换后的日期数量:', transformedDates.length);
        console.log('[NightShiftManager] 转换后的日期列表:', transformedDates);

        if (transformedDates.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 p-4">暂无排班数据</div>';
            console.warn('[NightShiftManager] 没有排班数据，渲染空状态');
            return;
        }

        // 【修复】获取所有员工（包括不可排大夜的），但标记是否可排
        const staffMap = new Map();

        // 从staffData中获取所有员工（包括不可排大夜的）
        staffData.forEach(staff => {
            const staffId = staff.staffId || staff.id;

            // 检查是否可以排大夜（但不跳过，而是标记）
            const canDoNightShift = this.canDoNightShift(staff);

            // 添加到staffMap（所有员工都显示）
            staffMap.set(staffId, {
                ...staff,
                staffId: staffId,
                id: staffId,
                name: staff.name || '',
                gender: staff.gender || '',
                region: staff.location || staff.region || '',
                personType: staff.personType || '未设置',
                canDoNightShift: canDoNightShift  // 标记是否可排大夜
            });
        });

        // 从排班结果中补充员工信息（防止有排班但staffData中没有的情况）
        transformedDates.forEach(date => {
            const daySchedule = transformedSchedule[date] || [];
            daySchedule.forEach(assignment => {
                if (!staffMap.has(assignment.staffId)) {
                    staffMap.set(assignment.staffId, {
                        staffId: assignment.staffId,
                        id: assignment.staffId,
                        name: assignment.name,
                        gender: assignment.gender,
                        region: assignment.region,
                        personType: '未设置'
                    });
                }
            });
        });

        const staffList = Array.from(staffMap.values());
        console.log(`[NightShiftManager] 符合大夜排班条件的员工数量（含0天）: ${staffList.length}`);

        // 按ID排序（与个性化需求页面一致）
        staffList.sort((a, b) => {
            const idA = String(a.staffId || a.id || '');
            const idB = String(b.staffId || b.id || '');
            return idA.localeCompare(idB, undefined, { numeric: true });
        });

        // 生成日期信息（包含星期和节假日）
        const dateInfoList = transformedDates.map(dateStr => {
            const date = new Date(dateStr);
            const day = date.getDate();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekday = weekdays[date.getDay()];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            // 获取节假日信息
            const holidayName = typeof HolidayManager !== 'undefined'
                ? HolidayManager.getHolidayName(dateStr)
                : '';
            const isFixedHoliday = typeof HolidayManager !== 'undefined'
                ? HolidayManager.isFixedHoliday(dateStr)
                : false;
            const lunarHoliday = typeof LunarHolidays !== 'undefined'
                ? LunarHolidays.getHoliday(dateStr)
                : null;

            // 判断是否为特殊节假日
            const isSpecial = holidayName || isFixedHoliday || lunarHoliday;

            // 【修复】优先从排班周期管理的 restDaysSnapshot 获取休息日状态
            const hasExplicitOverride = Object.prototype.hasOwnProperty.call(restDaysSnapshot, dateStr);
            const isDefaultHolidayRest = (() => {
                // 法定节假日当天默认休息
                if (holidayName && ['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) {
                    return true;
                }
                // 春节第一天及之后2天默认休息
                if (holidayName === '春节') {
                    return true;
                }
                // 国庆（10月1日）及之后2天默认休息
                if (holidayName === '国庆') {
                    const month = date.getMonth() + 1;
                    const day = date.getDate();
                    if (month === 10 && day >= 1 && day <= 3) {
                        return true;
                    }
                }
                return false;
            })();

            const isRestDay = hasExplicitOverride
                ? restDaysSnapshot[dateStr] === true
                : (isDefaultHolidayRest || isWeekend);

            return {
                dateStr,
                day,
                weekday,
                isWeekend,
                isRestDay,
                isSpecial,
                holidayName
            };
        });

        // 计算特殊节假日连休（使用 restDaysSnapshot）
        const connectedToSpecialSet = restDaysSnapshot && Object.keys(restDaysSnapshot).length > 0
            ? this.calculateConnectedToSpecial(dateInfoList, restDaysSnapshot)
            : new Set();

        console.log('[NightShiftManager] 特殊节假日连休:', connectedToSpecialSet);

        let html = `
            <div class="overflow-x-auto overflow-y-auto" style="max-height: 600px;">
                <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: fixed;">
                    <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                        <tr>
        `;

        // 固定列表头（支持排序）
        const fixedColumns = [
            { key: 'status', label: '状态', width: 40, sortable: false },
            { key: 'nightShiftCount', label: '天数', width: 50, sortable: true, class: 'bg-orange-100' },
            { key: 'staffId', label: 'ID', width: 60, sortable: true },
            { key: 'name', label: '姓名', width: 70, sortable: true },
            { key: 'gender', label: '性别', width: 50, sortable: true },
            { key: 'personType', label: '人员类型', width: 100, sortable: true, class: 'bg-blue-100' },
            { key: 'region', label: '归属地', width: 80, sortable: true, class: 'bg-green-100' }
        ];

        fixedColumns.forEach(col => {
            const sortIcon = col.sortable ? this.getHeaderSortIcon(col.key) : '';
            const onclick = col.sortable ? `onclick="NightShiftManager.handleSort('${col.key}', 'staff')"` : '';
            const cursorClass = col.sortable ? 'cursor-pointer hover:opacity-80' : '';

            html += `
                <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 ${col.class || ''} ${cursorClass}"
                    style="width: ${col.width}px; min-width: ${col.width}px;"
                    title="${col.label}${col.sortable ? '\\n点击排序' : ''}"
                    ${onclick}>
                    ${col.label}${sortIcon}
                </th>
            `;
        });

        html += `
        `;

        // 生成日期表头
        dateInfoList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const isConnectedToSpecial = connectedToSpecialSet.has(dateStr);

            // 【修复】完全按照排班周期管理的逻辑来判断颜色
            // 颜色逻辑（与排班周期管理保持一致）：
            // 1. 特殊节假日 + 休息日 -> 红色（bg-red-500）
            // 2. 与特殊节假日连通的休息日 -> 红色（bg-red-500）
            // 3. 普通休息日（未连通特殊节假日）-> 蓝色（bg-blue-400）
            // 4. 普通工作日 -> 灰色（bg-gray-50）
            let bgColor, textColor, borderColor;

            if (dateInfo.isSpecial && dateInfo.isRestDay) {
                // 特殊节假日且是休息日 -> 红色
                bgColor = 'bg-red-500';
                textColor = 'text-white';
                borderColor = 'border-red-600';
            } else if (dateInfo.isRestDay && isConnectedToSpecial) {
                // 与特殊节假日连通的休息日 -> 红色
                bgColor = 'bg-red-500';
                textColor = 'text-white';
                borderColor = 'border-red-600';
            } else if (dateInfo.isRestDay) {
                // 休息日（周末或工作日被标记为休息）未连通特殊假日 -> 蓝色
                bgColor = 'bg-blue-400';
                textColor = 'text-white';
                borderColor = 'border-blue-500';
            } else {
                // 工作日（包含特殊节假日被设为工作日、周末被设为工作日、普通工作日）
                bgColor = 'bg-gray-50';
                textColor = 'text-gray-700';
                borderColor = 'border-gray-300';
            }

            // 获取排序图标
            const sortIcon = this.getHeaderSortIcon(dateStr);

            html += `
                <th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor} cursor-pointer hover:opacity-80"
                    style="width: 30px; min-width: 30px;"
                    title="${dateStr}${dateInfo.holidayName ? ' ' + dateInfo.holidayName : ''}\\n点击排序"
                    onclick="NightShiftManager.handleSort('${dateStr}', 'date')">
                    <div class="text-xs font-bold">${dateInfo.day}${sortIcon}</div>
                    <div class="text-xs">${dateInfo.weekday}</div>
                </th>
            `;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // 对员工数据进行排序
        let sortedStaffList = [...staffList];

        if (this.currentSortColumn && this.currentSortColumn.state !== 'none') {
            sortedStaffList = this.sortStaffData(
                sortedStaffList,
                this.currentSortColumn.key,
                this.currentSortColumn.state
            );
        }

        console.log('[NightShiftManager] 排序后的员工数据（第一个表格）:', sortedStaffList.map(s => s.staffId));

        // 生成人员行
        sortedStaffList.forEach((staff, index) => {
            const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

            // 获取该员工的休假配置
            const staffVacations = personalRequests[staff.staffId] || {};

            // 统计该员工的大夜天数（只统计大夜，不统计休整期）
            let nightShiftCount = 0;
            transformedDates.forEach(date => {
                const daySchedule = transformedSchedule[date] || [];
                const assignment = daySchedule.find(s => s.staffId === staff.staffId);
                if (assignment && assignment.shiftType === 'night') {
                    nightShiftCount++;
                }
            });

            // 检查是否超过限制（仅对可排大夜的员工检查）
            const maxDays = 4; // 男生最大4天
            const hasError = staff.canDoNightShift && nightShiftCount > maxDays;
            
            // 对于不可排大夜的员工，整行置灰
            const isDisabled = !staff.canDoNightShift;
            const disabledRowClass = isDisabled ? 'opacity-60' : '';
            const disabledTextClass = isDisabled ? 'text-gray-500' : '';

            html += `
                <tr class="${rowClass} ${disabledRowClass}" data-staff-id="${staff.staffId}">
                    <td class="px-1 py-1 text-center border border-gray-300 align-middle">
                        ${hasError ? `
                            <span class="inline-block w-4 h-4 bg-red-500 rounded-full cursor-help"
                                  title="已分配${nightShiftCount}天大夜，超过限制${maxDays}天"
                                  style="position: relative;">
                                <span class="absolute inset-0 flex items-center justify-center text-white text-[10px]">!</span>
                            </span>
                        ` : isDisabled ? `
                            <span class="inline-block w-4 h-4 bg-gray-400 rounded-full cursor-help"
                                  title="不可排大夜"
                                  style="position: relative;">
                                <span class="absolute inset-0 flex items-center justify-center text-white text-[10px]">×</span>
                            </span>
                        ` : '<span class="inline-block w-4 h-4"></span>'}
                    </td>
                    <td class="px-1 py-1 text-center text-xs font-bold ${isDisabled ? 'text-gray-400' : 'text-gray-900'} border border-gray-300 ${isDisabled ? 'bg-gray-100' : 'bg-orange-50'}">${nightShiftCount}</td>
                    <td class="px-1 py-1 text-center text-xs ${disabledTextClass} border border-gray-300">${staff.id || staff.staffId}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium ${disabledTextClass} border border-gray-300">${staff.name || ''}</td>
                    <td class="px-1 py-1 text-center text-xs font-bold border border-gray-300 ${
                        isDisabled 
                            ? 'text-gray-500 bg-gray-100' 
                            : (staff.gender === '男' || staff.gender === 'M' || staff.gender === 'male')
                                ? 'text-blue-900 bg-blue-200' 
                                : (staff.gender === '女' || staff.gender === 'F' || staff.gender === 'female')
                                    ? 'text-pink-900 bg-pink-200'
                                    : 'text-gray-600 bg-gray-100'
                    }">${staff.gender || '未知'}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium ${isDisabled ? 'text-gray-500' : 'text-blue-700'} border border-gray-300 ${isDisabled ? 'bg-gray-100' : 'bg-blue-50'}">${staff.personType || '未设置'}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium ${isDisabled ? 'text-gray-500' : 'text-green-700'} border border-gray-300 ${isDisabled ? 'bg-gray-100' : 'bg-green-50'}">${this.getRegionDisplayName(staff.location || staff.region)}</td>
            `;

            // 为每天生成单元格
            dateInfoList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const daySchedule = transformedSchedule[dateStr] || [];
                const assignment = daySchedule.find(s => s.staffId === staff.staffId);

                // 获取休假类型
                const vacationType = staffVacations[dateStr];

                // 使用新的渲染函数（传入canDoNightShift标记）
                const cellHTML = this.renderScheduleCell(assignment, vacationType, dateStr, staff.staffId, staff.canDoNightShift);
                html += cellHTML;
            });

            html += `
                </tr>
            `;
        });

        // 统计行（每天的人数）
        html += `
                <tr class="bg-gray-100 font-semibold" style="position: sticky; bottom: 0; z-index: 19;">
                    <td class="px-1 py-1 text-center text-xs text-gray-700 border border-gray-300" colspan="7">当天大夜人数</td>
        `;

        dateInfoList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const daySchedule = transformedSchedule[dateStr] || [];

            // 【关键修复】过滤休整期: shiftType='rest' 或 isPostShiftRest=true,只统计大夜人数
            const nightShiftAssignments = daySchedule.filter(s => {
                const shiftType = s.shiftType || 'night';
                const isPostShiftRest = s.isPostShiftRest || false;
                return shiftType !== 'rest' && !isPostShiftRest;
            });
            const shCount = nightShiftAssignments.filter(s => s.region === 'shanghai').length;
            const count = nightShiftAssignments.length;

            html += `
                <td class="px-0.5 py-1 text-center text-xs border border-gray-300 bg-blue-50" title="上海: ${shCount}">
                    ${count}<br>
                    <span class="text-[10px] text-gray-600">SH:${shCount}</span>
                </td>
            `;
        });

        html += `
                </tr>
            </tbody>
        </table>
    </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 渲染人力分析（在结果区域）
     * @param {Object} manpowerAnalysis - 人力分析结果
     */
    renderManpowerAnalysisInResults(manpowerAnalysis) {
        const container = document.getElementById('manpowerAnalysisContainer');
        if (!container) return;

        if (!manpowerAnalysis || !manpowerAnalysis.shanghai) {
            container.innerHTML = '<div class="stats-placeholder">暂无人力分析数据</div>';
            return;
        }

        const sh = manpowerAnalysis.shanghai;
        
        // 计算详细分析
        const totalStaff = (sh.totalMales || 0) + (sh.totalFemales || 0);
        const avgDailySupply = totalStaff > 0 ? ((sh.totalSupply || 0) / (sh.totalDays || 31)).toFixed(2) : '0.00';
        const avgDailyDemand = (sh.totalDemand || 0) / (sh.totalDays || 31);
        const utilizationRate = (sh.totalDemand || 0) > 0 ? (((sh.totalDemand || 0) / (sh.totalSupply || 1)) * 100).toFixed(1) : '0.0';
        
        // 生成分析说明
        let analysisText = '';
        if (sh.isSufficient) {
            if ((sh.surplus || 0) > 5) {
                analysisText = '人力非常富足，可以考虑减少部分员工的排班天数或启用精英轮空策略。';
            } else {
                analysisText = '人力基本充足，可以满足排班需求。';
            }
        } else {
            analysisText = '人力不足，建议增加排班天数或调整每日需求配置。';
        }

        const html = `
            <div class="stats-grid">
                <div class="stats-card">
                    <h4>${sh.region || '上海'}地区人力分析</h4>
                    
                    <div class="border-b pb-2 mb-2">
                        <h5 class="text-sm font-semibold text-gray-700 mb-1">人员构成</h5>
                        <div class="stat-item">男生人数: <span class="font-bold text-blue-700">${sh.totalMales || 0}</span></div>
                        <div class="stat-item">女生人数: <span class="font-bold text-pink-700">${sh.totalFemales || 0}</span></div>
                        <div class="stat-item">总人数: <span class="font-bold">${totalStaff}</span></div>
                    </div>
                    
                    <div class="border-b pb-2 mb-2">
                        <h5 class="text-sm font-semibold text-gray-700 mb-1">需求配置</h5>
                        <div class="stat-item">每日需求: <span class="font-bold">${sh.dailyMin || 1}-${sh.dailyMax || 2}人</span></div>
                        <div class="stat-item">总需求人天数: <span class="font-bold">${sh.totalDemand || 0}</span></div>
                        <div class="stat-item">平均每日需求: <span class="font-bold">${avgDailyDemand.toFixed(2)}人</span></div>
                    </div>
                    
                    <div class="border-b pb-2 mb-2">
                        <h5 class="text-sm font-semibold text-gray-700 mb-1">供给能力</h5>
                        <div class="stat-item">总供给人天数: <span class="font-bold">${sh.totalSupply || 0}</span></div>
                        <div class="stat-item">平均每日供给: <span class="font-bold">${avgDailySupply}人</span></div>
                        <div class="stat-item">利用率: <span class="font-bold">${utilizationRate}%</span></div>
                    </div>
                    
                    <div class="border-b pb-2 mb-2">
                        <h5 class="text-sm font-semibold text-gray-700 mb-1">供需平衡</h5>
                        <div class="stat-item">富裕/不足: <span class="font-bold ${(sh.surplus || 0) >= 0 ? 'text-green-600' : 'text-red-600'}">${(sh.surplus || 0) >= 0 ? '+' : ''}${sh.surplus || 0}人天</span></div>
                        <div class="stat-item">人力状态: <span class="font-bold ${sh.isSufficient ? 'text-green-600' : 'text-red-600'}">${sh.isSufficient ? '✓ 富足' : '✗ 不足'}</span></div>
                        <div class="stat-item">调整策略: <span class="font-bold">${this.getStrategyName(sh.adjustmentStrategy || 'normal')}</span></div>
                    </div>
                    
                    <div class="mt-2">
                        <h5 class="text-sm font-semibold text-gray-700 mb-1">分析说明</h5>
                        <div class="text-xs text-gray-600 bg-gray-50 p-2 rounded">${analysisText}</div>
                        <div class="text-xs text-gray-500 mt-2">配置来源: ${sh.dailyMax ? '每日人力配置' : '大夜配置规则'}</div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 渲染个人夜班天数排行（在结果区域）
     * @param {Object} stats - 统计信息
     */
    renderStaffRankingInResults(stats) {
        const container = document.getElementById('staffRankingContainer');
        if (!container) return;

        // 安全检查
        if (!stats) {
            console.warn('[NightShiftManager] renderStaffRankingInResults: stats 为空');
            container.innerHTML = '<div class="text-gray-500">暂无统计数据</div>';
            return;
        }

        // 地区统计
        let html = '<div class="summary-grid">';

        ['shanghai'].forEach(region => {
            const regionName = '上海';
            const regionStats = stats[region];

            // 安全检查：确保 regionStats 存在且是对象
            if (!regionStats || typeof regionStats !== 'object') {
                console.warn(`[NightShiftManager] renderStaffRankingInResults: stats[${region}] 为空或不是对象`, regionStats);
                html += `<div class="summary-card">
                    <h4>${regionName}</h4>
                    <div class="summary-item">总分配人次: <span>0</span></div>
                    <div class="summary-item">男生人次: <span>0</span></div>
                    <div class="summary-item">女生人次: <span>0</span></div>
                    <div class="summary-item">每天平均: <span>0人</span></div>
                </div>`;
                return;
            }

            // 使用安全的属性访问，确保所有属性都有默认值
            const totalAssignments = (regionStats && typeof regionStats.totalAssignments === 'number') ? regionStats.totalAssignments : 0;
            const maleAssignments = (regionStats && typeof regionStats.maleAssignments === 'number') ? regionStats.maleAssignments : 0;
            const femaleAssignments = (regionStats && typeof regionStats.femaleAssignments === 'number') ? regionStats.femaleAssignments : 0;
            const dailyAverage = (regionStats && regionStats.dailyAverage) ? regionStats.dailyAverage : '0.00';

            html += `<div class="summary-card">
                <h4>${regionName}</h4>
                <div class="summary-item">总分配人次: <span>${totalAssignments}</span></div>
                <div class="summary-item">男生人次: <span>${maleAssignments}</span></div>
                <div class="summary-item">女生人次: <span>${femaleAssignments}</span></div>
                <div class="summary-item">每天平均: <span>${dailyAverage}人</span></div>
            </div>`;
        });

        html += '</div>';

        container.innerHTML = html;
    },

    /**
     * 渲染排班表格（已废弃，保留用于向后兼容）
     * @param {Object} schedule - 排班表
     */
    renderScheduleTable(schedule) {
        const container = document.getElementById('nightShiftTable');
        if (!container) return;

        const dates = Object.keys(schedule).sort();

        if (dates.length === 0) {
            container.innerHTML = '<div class="empty-message">暂无排班数据</div>';
            return;
        }

        // 获取所有参与大夜排班的员工
        const staffMap = new Map();
        const staffData = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];

        dates.forEach(date => {
            const daySchedule = schedule[date] || [];
            daySchedule.forEach(assignment => {
                if (!staffMap.has(assignment.staffId)) {
                    const staff = staffData.find(s => (s.staffId || s.id) === assignment.staffId);
                    staffMap.set(assignment.staffId, {
                        ...staff,
                        staffId: assignment.staffId,
                        name: assignment.name,
                        gender: assignment.gender,
                        region: assignment.region
                    });
                }
            });
        });

        const staffList = Array.from(staffMap.values());

        // 生成日期信息（包含星期和节假日）
        const dateInfoList = dates.map(dateStr => {
            const date = new Date(dateStr);
            const day = date.getDate();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekday = weekdays[date.getDay()];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            return {
                dateStr,
                day,
                weekday,
                isWeekend
            };
        });

        let html = `
            <div class="overflow-x-auto overflow-y-auto" style="max-height: 600px;">
                <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: auto;">
                    <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                        <tr>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="min-width: 60px;">ID</th>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="min-width: 80px;">姓名</th>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="min-width: 60px;">性别</th>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-purple-100" style="min-width: 80px;">归属地</th>
        `;

        // 生成日期表头
        dateInfoList.forEach(dateInfo => {
            const bgColor = dateInfo.isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
            const textColor = dateInfo.isWeekend ? 'text-yellow-700' : 'text-gray-700';
            const borderColor = dateInfo.isWeekend ? 'border-yellow-200' : 'border-gray-300';

            html += `
                <th class="px-1 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}"
                    style="min-width: 35px;"
                    title="${dateInfo.dateStr}">
                    <div class="text-xs font-bold">${dateInfo.day}</div>
                    <div class="text-xs">${dateInfo.weekday}</div>
                </th>
            `;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // 生成人员行
        sortedStaffList.forEach((staff, index) => {
            const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            html += `
                <tr class="${rowClass}" data-staff-id="${staff.staffId}">
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.staffId}</td>
                    <td class="px-2 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.gender || '未知'}</td>
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.region === 'shanghai' ? '上海' : '上海'}</td>
            `;

            // 为每天生成单元格
            dateInfoList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const daySchedule = schedule[dateStr] || [];
                const assignment = daySchedule.find(s => s.staffId === staff.staffId);

                let cellContent = '';
                let cellClass = 'px-1 py-1 text-center text-xs border border-gray-300';

                if (assignment) {
                    const isBackup = assignment.isBackup;
                    const bgColor = isBackup ? 'bg-orange-200' : 'bg-blue-100';
                    const textColor = isBackup ? 'text-orange-900' : 'text-blue-900';

                    cellContent = '大夜';
                    cellClass += ` ${bgColor} ${textColor} font-semibold`;
                } else {
                    cellClass += ' bg-gray-50';
                }

                html += `
                    <td class="${cellClass}" title="${dateStr}">${cellContent}</td>
                `;
            });

            html += `
                </tr>
            `;
        });

        // 统计行（每天的人数）
        html += `
                <tr class="bg-gray-100 font-semibold" style="position: sticky; bottom: 0; z-index: 19;">
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300" colspan="4">当天大夜人数</td>
        `;

        dateInfoList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const daySchedule = schedule[dateStr] || [];

            // 【关键修复】过滤休整期: shiftType='rest' 或 isPostShiftRest=true,只统计大夜人数
            const nightShiftAssignments = daySchedule.filter(s => {
                const shiftType = s.shiftType || 'night';
                const isPostShiftRest = s.isPostShiftRest || false;
                return shiftType !== 'rest' && !isPostShiftRest;
            });
            const count = nightShiftAssignments.length;
            const shCount = nightShiftAssignments.filter(s => s.region === 'shanghai').length;

            html += `
                <td class="px-1 py-1 text-center text-xs border border-gray-300 bg-blue-50" title="上海: ${shCount}">
                    ${count}<br>
                    <span class="text-[10px] text-gray-600">SH:${shCount}</span>
                </td>
            `;
        });

        html += `
                </tr>
            </tbody>
        </table>
    </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 渲染统计摘要
     * @param {Object} stats - 统计信息
     */
    renderScheduleSummary(stats) {
        const container = document.getElementById('nightShiftSummary');
        if (!container) return;

        let html = '<div class="summary-grid">';

        // 地区统计
        ['shanghai'].forEach(region => {
            const regionName = '上海';
            const regionStats = stats[region];

            html += `<div class="summary-card">
                <h4>${regionName}</h4>
                <div class="summary-item">总分配人次: <span>${regionStats.totalAssignments}</span></div>
                <div class="summary-item">男生人次: <span>${regionStats.maleAssignments}</span></div>
                <div class="summary-item">女生人次: <span>${regionStats.femaleAssignments}</span></div>
                <div class="summary-item">每天平均: <span>${regionStats.dailyAverage}人</span></div>
            </div>`;
        });

        html += '</div>';

        // 个人统计（前10名）
        const staffList = Object.values(stats.staffStats)
            .sort((a, b) => b.days - a.days)
            .slice(0, 10);

        html += '<h4>个人夜班天数排行（前10）</h4>';
        html += '<table class="staff-stats-table"><thead><tr>';
        html += '<th>姓名</th><th>地区</th><th>性别</th><th>天数</th></tr></thead><tbody>';

        staffList.forEach(staff => {
            const regionName = '上海';
            html += `<tr>
                <td>${staff.name}</td>
                <td>${regionName}</td>
                <td>${staff.gender}</td>
                <td>${staff.days}</td>
            </tr>`;
        });

        html += '</tbody></table>';

        container.innerHTML = html;
    },

    /**
     * 将大夜排班应用到主排班表
     */
    async applyToMainSchedule() {
        if (!this.currentSchedule) {
            alert('请先生成大夜排班');
            return;
        }

        try {
            const scheduleData = Store.state?.scheduleData || {};

            // 遍历大夜排班表
            for (const date in this.currentSchedule) {
                const daySchedule = this.currentSchedule[date];

                daySchedule.forEach(assignment => {
                    // 设置排班类型
                    if (!scheduleData[assignment.staffId]) {
                        scheduleData[assignment.staffId] = {};
                    }
                    scheduleData[assignment.staffId][date] = '大夜';
                });
            }

            // 更新到状态
            Store.updateState({
                scheduleData
            }, false);

            // 刷新排班表显示
            if (typeof ScheduleDisplayManager !== 'undefined' && ScheduleDisplayManager.refreshScheduleTable) {
                await ScheduleDisplayManager.refreshScheduleTable();
            }

            alert('大夜排班已应用到主排班表');
        } catch (error) {
            console.error('[NightShiftManager] 应用到主排班表失败:', error);
            alert('应用失败: ' + error.message);
        }
    },

    // ==================== 严格连续排班算法 ====================

    /**
     * 生成严格连续排班（基于Python算法的JavaScript实现）
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} 排班结果
     */
    async generateStrictContinuousSchedule(dateRange) {
        console.log('[NightShiftManager] 开始生成严格连续排班');
        console.log(`  - 日期范围: ${dateRange.startDate} 至 ${dateRange.endDate}`);

        try {
            // 1. 获取配置
            const strictConfig = NightShiftConfigRules.getConfig().strictContinuous || {};
            const rateSch = strictConfig.rateSch || 1.0;
            const isNul = strictConfig.isNul !== undefined ? strictConfig.isNul : true;
            const regionConfig = NightShiftConfigRules.getRegionConfig('shanghai');
            const dailyTarget = regionConfig.dailyMax || 2;
            
            // 【新增】获取排班后遗症管理配置
            let postShiftRestDays = strictConfig.postShiftRestDays || 2;
            let maxConsecutiveRestLimit = strictConfig.maxConsecutiveRestLimit || 3;
            
            // 如果 maxConsecutiveRestLimit 为 0，从排班周期管理获取
            if (maxConsecutiveRestLimit === 0 && typeof SchedulePeriodManager !== 'undefined') {
                try {
                    const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
                    if (activeSchedulePeriodConfigId) {
                        const periodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
                        if (periodConfig && periodConfig.maxConsecutiveRestDays) {
                            maxConsecutiveRestLimit = periodConfig.maxConsecutiveRestDays;
                            console.log(`[严格连续排班] 从排班周期管理获取最大连休上限: ${maxConsecutiveRestLimit}`);
                        }
                    }
                } catch (error) {
                    console.warn('[严格连续排班] 无法从排班周期管理获取最大连休上限，使用默认值:', error);
                }
            }
            
            console.log(`[严格连续排班] 排班后遗症配置: 大夜后休${postShiftRestDays}天, 最大连休${maxConsecutiveRestLimit}天`);

            // 2. 获取数据
            const staffData = this.getStaffByRegion('shanghai');
            const personalRequests = Store.state.personalRequests || {};
            const restDays = Store.getAllRestDays() || {};

            // 3. 生成日期列表
            const dateList = this.getDateList(dateRange);
            const totalDays = dateList.length;
            const maxActiveDays = Math.ceil(totalDays * rateSch);

            console.log(`[严格连续排班] 总天数: ${totalDays}, 开工率: ${rateSch}, 最大开工天数: ${maxActiveDays}, 每日目标: ${dailyTarget}`);

            // 4. 初始化员工对象（传入总天数用于预计算不可用集合）
            const employees = this._createEmployeeObjects(staffData, personalRequests, dateRange, totalDays);

            // 5. 计算目标天数（供需平衡和轮空逻辑）
            this._calculateTargets(employees, totalDays, dailyTarget, maxActiveDays, isNul);

            // 6. 生成分布掩码（离散分段模式）
            const preferredMask = this._generateBlockMask(totalDays, maxActiveDays);

            // 7. 初始化排班表
            const schedule = {};
            const dailyLoad = new Array(totalDays).fill(0);
            dateList.forEach((date, idx) => {
                schedule[date] = [];
            });

            // 8. 执行排班（按优先级排序，并使用随机数种子打乱）
            const activeEmployees = employees.filter(e => e.can_work && e.target_days > 0);
            
            // 获取随机数种子
            const randomSeed = strictConfig.randomSeed !== null && strictConfig.randomSeed !== undefined 
                ? strictConfig.randomSeed 
                : Date.now();
            
            // 简单的线性同余生成器（LCG）用于可重复的随机数
            let seed = randomSeed;
            const lcg = () => {
                seed = (seed * 1664525 + 1013904223) % Math.pow(2, 32);
                return seed / Math.pow(2, 32);
            };
            
            console.log(`[严格连续排班] 使用随机数种子: ${randomSeed}`);
            
            activeEmployees.sort((a, b) => {
                // 最难排的先排：请假天数多的人 > 目标天数多的人 > 休息优先级低的人
                const aLeaveCount = a.specific_leave_indices.size;
                const bLeaveCount = b.specific_leave_indices.size;
                if (aLeaveCount !== bLeaveCount) return bLeaveCount - aLeaveCount;
                if (a.target_days !== b.target_days) return b.target_days - a.target_days;
                
                // 如果优先级相同，使用随机数种子打乱顺序
                const priorityDiff = a.calculate_rest_priority() - b.calculate_rest_priority();
                if (priorityDiff === 0) {
                    // 使用随机数种子打乱相同优先级的员工
                    return lcg() - 0.5; // 返回 -0.5 到 0.5 之间的随机值
                }
                return priorityDiff;
            });

            // 9. 为每个员工分配连续大夜（传入排班后遗症管理参数）
            for (const emp of activeEmployees) {
                this._scheduleSingleStrictContinuous(
                    emp,
                    dateList,
                    schedule,
                    dailyLoad,
                    preferredMask,
                    personalRequests,
                    restDays,
                    dailyTarget,
                    postShiftRestDays,
                    maxConsecutiveRestLimit
                );
            }

            // 10. 转换排班格式（从新格式转换为旧格式）
            const convertedSchedule = this._convertScheduleFormat(schedule, dateList);

            // 11. 生成统计信息
            const stats = this._calculateStrictScheduleStats(convertedSchedule, employees, dateList);

            // 12. 计算人力分析（兼容原有格式）
            const manpowerAnalysis = this.calculateAllManpowerSufficiency(dateRange);
            this.currentManpowerAnalysis = manpowerAnalysis;

            // 13. 保存到实例变量
            this.currentSchedule = convertedSchedule;

            // 14. 持久化到数据库
            await DB.saveNightShiftSchedule({
                scheduleId: 'current',
                schedule: convertedSchedule,
                stats,
                dateRange,
                createdAt: new Date().toISOString()
            });

            const result = {
                schedule: convertedSchedule,
                stats,
                manpowerAnalysis: manpowerAnalysis,
                dateRange,
                generatedAt: new Date().toISOString(),
                algorithm: 'strictContinuous'
            };

            console.log('[NightShiftManager] 严格连续排班生成完成');
            return result;
        } catch (error) {
            console.error('[NightShiftManager] 生成严格连续排班失败:', error);
            throw error;
        }
    },

    /**
     * 创建员工对象
     * @param {Array} staffData - 员工数据
     * @param {Object} personalRequests - 个性化休假请求
     * @param {Object} dateRange - 日期范围
     * @param {number} totalDays - 总天数（用于预计算不可用集合）
     */
    _createEmployeeObjects(staffData, personalRequests, dateRange, totalDays) {
        const employees = [];
        const startDate = new Date(dateRange.startDate);

        for (const staff of staffData) {
            const staffId = this.getStaffId(staff);
            const emp = {
                id: staffId,
                name: staff.name || staffId,
                gender: staff.gender || '男',
                can_work: this.canDoNightShift(staff),
                period_type: staff.menstrualPeriod || staff.menstrualPeriodType || null,
                last_month_night: this.getLastMonthNightShiftDays(staffId, { startDate: dateRange.startDate, endDate: dateRange.endDate }) || 0,
                holiday_work_load: (staff.holidayWorkDays || 0) + (staff.lastYearSpringWorkDays || 0) + (staff.lastYearNationalWorkDays || 0),
                target_days: 0,
                assigned_days: [],
                is_skipped: false,
                specific_leave_indices: new Set()
            };

            // 解析休假日期
            const staffRequests = personalRequests[staffId] || {};
            Object.keys(staffRequests).forEach(dateStr => {
                if (staffRequests[dateStr]) {
                    try {
                        const date = new Date(dateStr);
                        if (date >= startDate && date <= new Date(dateRange.endDate)) {
                            const idx = Math.floor((date - startDate) / (1000 * 60 * 60 * 24));
                            if (idx >= 0) {
                                emp.specific_leave_indices.add(idx);
                            }
                        }
                    } catch (e) {
                        console.warn(`[创建员工对象] 无法解析休假日期: ${dateStr}`, e);
                    }
                }
            });

            // 计算休息优先级
            emp.calculate_rest_priority = function() {
                let score = 0;
                score += this.last_month_night * 100;
                score += this.holiday_work_load * 10;
                if (this.last_month_night === 0) {
                    score -= 1000;
                } else {
                    score += 50;
                }
                return score;
            };

            // 【新增】预计算所有不可用日期索引（包含生理期+休假），用于快速查找
            emp.all_unavailable_indices = this._getUnavailableIndices(emp, totalDays);

            employees.push(emp);
        }

        return employees;
    },

    /**
     * 计算目标天数（供需平衡和轮空逻辑）
     */
    _calculateTargets(employees, totalDays, dailyTarget, maxActiveDays, isNul) {
        const activeStaff = employees.filter(e => e.can_work);

        // 初始目标天数
        for (const e of activeStaff) {
            e.target_days = e.gender === '男' ? 4 : 3;
            e.is_skipped = false;
        }

        // 计算供需
        const totalCapacity = maxActiveDays * dailyTarget;
        let currentSupply = activeStaff.reduce((sum, e) => sum + e.target_days, 0);
        let gap = currentSupply - totalCapacity;

        console.log(`[计算目标] 供给: ${currentSupply}, 容量: ${totalCapacity}, 缺口: ${gap}`);

        if (gap > 0) {
            if (isNul) {
                console.log('>>> 启用精英轮空 (isNul=true)');
                // 按休息优先级排序（优先级高的先轮空）
                activeStaff.sort((a, b) => b.calculate_rest_priority() - a.calculate_rest_priority());
                let idx = 0;
                while (gap > 0 && idx < activeStaff.length) {
                    const cand = activeStaff[idx];
                    const removed = cand.target_days;
                    cand.target_days = 0;
                    cand.is_skipped = true;
                    gap -= removed;
                    console.log(`    - 轮空: ${cand.name}`);
                    idx++;
                }
            } else {
                console.log('>>> 启用平均减负');
                activeStaff.sort((a, b) => b.last_month_night - a.last_month_night);
                for (const e of activeStaff) {
                    if (gap <= 0) break;
                    if (e.gender === '男' && e.target_days > 3) {
                        e.target_days -= 1;
                        gap -= 1;
                    }
                }
            }
        }
    },

    /**
     * 生成分布掩码（离散分段模式）
     */
    _generateBlockMask(totalDays, maxActiveDays) {
        const mask = new Array(totalDays).fill(false);
        if (maxActiveDays >= totalDays) {
            return mask.fill(true);
        }

        const minBlockSize = 4;
        const numBlocks = Math.max(1, Math.floor(maxActiveDays / minBlockSize));
        
        if (numBlocks <= 1) {
            const start = Math.floor((totalDays - maxActiveDays) / 2);
            for (let i = start; i < start + maxActiveDays && i < totalDays; i++) {
                mask[i] = true;
            }
        } else {
            const starts = [];
            for (let i = 0; i < numBlocks; i++) {
                starts.push(Math.floor((i / (numBlocks - 1)) * (totalDays - minBlockSize)));
            }
            
            let allocated = 0;
            for (const start of starts) {
                const end = Math.min(start + minBlockSize, totalDays);
                for (let i = start; i < end; i++) {
                    mask[i] = true;
                    allocated++;
                }
            }
            
            let rem = maxActiveDays - allocated;
            for (let i = 0; i < totalDays - 1 && rem > 0; i++) {
                if (mask[i] && !mask[i + 1]) {
                    mask[i + 1] = true;
                    rem--;
                }
            }
        }

        return mask;
    },

    /**
     * 为单个员工分配严格连续大夜
     * @param {Object} emp - 员工对象
     * @param {Array} dateList - 日期列表
     * @param {Object} schedule - 排班表
     * @param {Array} dailyLoad - 每日负载
     * @param {Array} preferredMask - 偏好掩码
     * @param {Object} personalRequests - 个性化休假请求
     * @param {Object} restDays - 休息日
     * @param {number} dailyTarget - 每日目标人数
     * @param {number} postShiftRestDays - 大夜后强制休整期天数
     * @param {number} maxConsecutiveRestLimit - 最大连休上限
     */
    _scheduleSingleStrictContinuous(emp, dateList, schedule, dailyLoad, preferredMask, personalRequests, restDays, dailyTarget, postShiftRestDays = 2, maxConsecutiveRestLimit = 3) {
        const daysNeeded = emp.target_days;
        // 使用预计算的不可用集合（如果存在），否则重新计算
        const unavailable = emp.all_unavailable_indices || this._getUnavailableIndices(emp, dateList.length);

        // 尝试降级搜索：4天 -> 3天 -> 2天 -> 1天
        for (let attemptDays = daysNeeded; attemptDays > 0; attemptDays--) {
            let bestStart = -1;
            let minCost = Infinity;

            // 遍历时间轴
            for (let startIdx = 0; startIdx <= dateList.length - attemptDays; startIdx++) {
                const indices = [];
                for (let i = 0; i < attemptDays; i++) {
                    indices.push(startIdx + i);
                }

                // 1. 休假/生理期 绝对避让
                let hasConflict = false;
                for (const idx of indices) {
                    if (unavailable.has(idx)) {
                        hasConflict = true;
                        break;
                    }
                }
                if (hasConflict) continue;

                // 2. 人数限制 绝对避让
                let validCapacity = true;
                for (const idx of indices) {
                    if (dailyLoad[idx] >= dailyTarget) {
                        validCapacity = false;
                        break;
                    }
                }
                if (!validCapacity) continue;

                // 3. 【新增】大夜后连休限制检查（排班后遗症管理）
                const endIdx = indices[indices.length - 1]; // 排班的最后一天
                if (postShiftRestDays > 0 && maxConsecutiveRestLimit > 0) {
                    if (!this._checkPostShiftRestConstraint(emp, endIdx, dateList.length, postShiftRestDays, maxConsecutiveRestLimit, unavailable)) {
                        // 如果这会导致后面连休太长，则放弃这个时间段
                        continue;
                    }
                }

                // 4. 评分（优先选在Mask区域，优先选已经有1人的日子）
                let cost = 0;
                let maskVio = 0;
                for (const idx of indices) {
                    if (!preferredMask[idx]) maskVio++;
                }
                if (maskVio > 0) cost += 1000; // 尽量别排在轮空期

                for (const idx of indices) {
                    if (dailyLoad[idx] === 0) cost += 10; // 开新坑代价
                    else cost += 0; // 填坑代价小
                }

                if (cost < minCost) {
                    minCost = cost;
                    bestStart = startIdx;
                }
            }

            // 如果找到了合法的连续块
            if (bestStart !== -1) {
                if (attemptDays < daysNeeded) {
                    console.log(`⚠️ ${emp.name} 降级排班: ${daysNeeded}天 -> ${attemptDays}天 (为了保证连续且避开休假)`);
                }

                // 执行分配
                for (let i = 0; i < attemptDays; i++) {
                    const idx = bestStart + i;
                    const dateStr = dateList[idx];
                    dailyLoad[idx] += 1;
                    emp.assigned_days.push(dateStr);
                    schedule[dateStr].push({
                        staffId: emp.id,
                        name: emp.name,
                        gender: emp.gender,
                        region: 'shanghai',
                        date: dateStr,
                        shiftType: 'night',
                        isAutoGenerated: true
                    });
                }

                // 【新增】自动添加大夜后休整期
                if (postShiftRestDays > 0) {
                    const endIdx = bestStart + attemptDays - 1;
                    for (let j = 1; j <= postShiftRestDays; j++) {
                        const restIdx = endIdx + j;
                        if (restIdx < dateList.length) {
                            const restDateStr = dateList[restIdx];
                            // 检查是否已经有排班（大夜），避免重复
                            const hasNightShift = schedule[restDateStr] && schedule[restDateStr].some(s => s.staffId === emp.id && s.shiftType === 'night');
                            if (!hasNightShift) {
                                // 添加休整期记录
                                schedule[restDateStr].push({
                                    staffId: emp.id,
                                    name: emp.name,
                                    gender: emp.gender,
                                    region: 'shanghai',
                                    date: restDateStr,
                                    shiftType: 'rest',
                                    isAutoGenerated: true,
                                    isPostShiftRest: true // 标记为大夜后休整期
                                });
                                console.log(`  ✓ ${emp.name} 添加休整期: ${restDateStr}`);
                            }
                        }
                    }
                }

                return; // 成功安排，退出函数
            }
        }

        // 如果循环结束还没return，说明连1天连续的都找不到
        console.log(`❌ ${emp.name} 无法安排任何连续班次，被迫轮空。`);
    },

    /**
     * 获取不可用日期索引
     */
    _getUnavailableIndices(employee, totalDays) {
        const unavailable = new Set();
        const half = Math.floor(totalDays / 2);
        
        // 生理期
        if (employee.period_type === '上' || employee.period_type === 'upper') {
            for (let i = 0; i < half; i++) {
                unavailable.add(i);
            }
        } else if (employee.period_type === '下' || employee.period_type === 'lower') {
            for (let i = half; i < totalDays; i++) {
                unavailable.add(i);
            }
        }
        
        // 休假日期
        employee.specific_leave_indices.forEach(idx => unavailable.add(idx));
        
        return unavailable;
    },

    /**
     * 【新增】检查大夜后的连休是否超标（排班后遗症管理）
     * @param {Object} emp - 员工对象
     * @param {number} endIdx - 大夜排班的最后一天索引
     * @param {number} totalDays - 总天数
     * @param {number} postShiftRestDays - 大夜后强制休整期天数
     * @param {number} maxConsecutiveRestLimit - 最大连休上限
     * @param {Set} unavailable - 不可用日期索引集合（包含生理期和休假）
     * @returns {boolean} true表示可以通过，false表示违规
     */
    _checkPostShiftRestConstraint(emp, endIdx, totalDays, postShiftRestDays, maxConsecutiveRestLimit, unavailable) {
        // 如果最大连休上限为0或未设置，不进行限制检查
        if (!maxConsecutiveRestLimit || maxConsecutiveRestLimit <= 0) {
            return true;
        }

        let currentDay = endIdx + 1; // 大夜结束后的第一天
        let consecutiveRestCount = 0;
        
        // 必须休息的截止点（相对索引）
        const mandatoryRestEnd = endIdx + postShiftRestDays;
        
        // 向后扫描，直到碰到一个工作日或超出排班周期
        while (currentDay < totalDays) {
            const isMandatory = (currentDay <= mandatoryRestEnd); // 是否在强制休整期内
            const isExistingLeave = unavailable.has(currentDay); // 是否已有休假/生理期
            
            if (isMandatory || isExistingLeave) {
                consecutiveRestCount++;
                currentDay++;
            } else {
                // 链条断裂（遇到工作日）
                break;
            }
        }
        
        // 检查是否超标
        if (consecutiveRestCount > maxConsecutiveRestLimit) {
            // 违规：连休天数超过限制
            console.log(`  ⚠️ ${emp.name} 在索引${endIdx}结束大夜会导致连休${consecutiveRestCount}天，超过限制${maxConsecutiveRestLimit}天`);
            return false;
        }
        
        return true;
    },

    /**
     * 转换排班格式（从新格式转换为旧格式）
     */
    _convertScheduleFormat(schedule, dateList) {
        const converted = {};
        dateList.forEach(date => {
            converted[date] = schedule[date] || [];
        });
        return converted;
    },

    /**
     * 计算严格排班统计信息（兼容原有格式）
     */
    _calculateStrictScheduleStats(schedule, employees, dateList) {
        // 使用与 calculateScheduleStats 相同的格式
        const stats = {
            totalDays: dateList.length,
            shanghai: {
                totalAssignments: 0,
                maleAssignments: 0,
                femaleAssignments: 0,
                dailyAverage: '0.00'
            },
            staffStats: {}
        };

        // 确保 schedule 和 dateList 存在
        if (!schedule || typeof schedule !== 'object') {
            console.warn('[NightShiftManager] _calculateStrictScheduleStats: schedule 为空或不是对象');
            return stats;
        }
        if (!dateList || !Array.isArray(dateList)) {
            console.warn('[NightShiftManager] _calculateStrictScheduleStats: dateList 为空或不是数组');
            return stats;
        }

        // 统计每天的分配情况（兼容原有格式）
        for (const date of dateList) {
            const daySchedule = schedule[date] || [];

            daySchedule.forEach(assignment => {
                if (assignment.region === 'shanghai') {
                    stats.shanghai.totalAssignments++;

                    if (assignment.gender === '男' || assignment.gender === 'M') {
                        stats.shanghai.maleAssignments++;
                    } else {
                        stats.shanghai.femaleAssignments++;
                    }

                    // 统计个人天数（兼容原有格式）
                    if (!stats.staffStats[assignment.staffId]) {
                        stats.staffStats[assignment.staffId] = {
                            staffId: assignment.staffId,
                            name: assignment.name,
                            gender: assignment.gender,
                            region: assignment.region,
                            days: 0
                        };
                    }
                    stats.staffStats[assignment.staffId].days++;
                }
            });
        }

        // 计算每天平均（确保 totalDays > 0）
        if (stats.totalDays > 0) {
            stats.shanghai.dailyAverage = (stats.shanghai.totalAssignments / stats.totalDays).toFixed(2);
        } else {
            stats.shanghai.dailyAverage = '0.00';
        }
        
        // 确保所有属性都是数字类型（防止 undefined）
        if (typeof stats.shanghai.totalAssignments !== 'number') {
            stats.shanghai.totalAssignments = 0;
        }
        if (typeof stats.shanghai.maleAssignments !== 'number') {
            stats.shanghai.maleAssignments = 0;
        }
        if (typeof stats.shanghai.femaleAssignments !== 'number') {
            stats.shanghai.femaleAssignments = 0;
        }

        // 添加额外信息（用于调试和展示）
        stats.algorithm = 'strictContinuous';
        stats.dailyStats = {};
        dateList.forEach(date => {
            stats.dailyStats[date] = (schedule[date] || []).length;
        });

        // 添加员工详细信息（用于调试）
        employees.forEach(emp => {
            if (!emp.can_work) return;
            if (stats.staffStats[emp.id]) {
                // 如果已有统计，添加额外信息
                stats.staffStats[emp.id].target = emp.target_days;
                stats.staffStats[emp.id].assigned = emp.assigned_days.length;
                stats.staffStats[emp.id].assignedDays = emp.assigned_days; // 保留日期数组用于调试
                stats.staffStats[emp.id].isSkipped = emp.is_skipped;
                stats.staffStats[emp.id].continuity = this._checkContinuity(emp.assigned_days);
            }
        });

        return stats;
    },

    /**
     * 检查连续性
     */
    _checkContinuity(dates) {
        if (!dates || dates.length === 0) return true;
        if (dates.length === 1) return true;
        
        const sorted = [...dates].sort();
        for (let i = 0; i < sorted.length - 1; i++) {
            const curr = new Date(sorted[i]);
            const next = new Date(sorted[i + 1]);
            const daysDiff = (next - curr) / (1000 * 60 * 60 * 24);
            if (daysDiff !== 1) {
                return false;
            }
        }
        return true;
    },

    /**
     * 获取上月大夜天数（辅助函数）
     */
    getLastMonthNightShiftDays(staffId, scheduleConfig) {
        // 尝试从历史数据获取
        if (typeof NightShiftSolver !== 'undefined' && NightShiftSolver.getLastMonthNightShiftDays) {
            return NightShiftSolver.getLastMonthNightShiftDays(staffId, scheduleConfig);
        }
        
        // 从员工数据获取
        const staffData = Store.getCurrentStaffData();
        const staff = staffData.find(s => (s.id || s.staffId) === staffId);
        if (staff && staff.lastMonthNightShiftDays !== undefined) {
            return staff.lastMonthNightShiftDays;
        }
        
        return 0;
    },

    // ==================== F. 大夜配置界面 ====================

    /**
     * 显示大夜排班配置界面
     * 展示完整的配置项，支持编辑和保存
     */
    async showNightShiftConfigUI() {
        console.log('[NightShiftManager] 显示大夜排班配置界面');

        // 更新标题
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '大夜排班配置';
        }

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        // 初始化配置规则（确保currentConfig已初始化）
        if (typeof NightShiftConfigRules !== 'undefined' && NightShiftConfigRules.init) {
            await NightShiftConfigRules.init();
        }

        // 获取当前配置
        const config = NightShiftConfigRules.getConfig();

        // 渲染配置界面
        scheduleTable.innerHTML = this.renderConfigForm(config);
    },

    /**
     * 渲染配置表单
     * @param {Object} config - 当前配置对象
     * @returns {string} HTML字符串
     */
    renderConfigForm(config) {
        const sh = config.regions.shanghai || {};
        const cr = config.crossRegion || {};
        const mc = config.manpowerCalculation || {};
        const cs = config.constraints || {};
        const mp = config.menstrualPeriod || {};
        const pri = config.priority || {};
        const sc = config.strictContinuous || {};

        return `
            <div class="p-6 max-w-6xl mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <div class="flex items-center">
                        <button onclick="NightShiftManager.showNightShiftManagement()"
                            class="mr-4 px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center">
                            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                            </svg>
                            返回
                        </button>
                        <h2 class="text-2xl font-bold text-gray-800">大夜排班配置</h2>
                    </div>
                    <div class="flex space-x-3">
                        <button onclick="NightShiftManager.exportConfigToJson()"
                            class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center space-x-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                            <span>导出</span>
                        </button>
                        <button onclick="document.getElementById('importConfigInput').click()"
                            class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center space-x-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                            </svg>
                            <span>导入</span>
                        </button>
                        <button onclick="NightShiftManager.resetConfigToDefault()"
                            class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                            <span>重置</span>
                        </button>
                        <button onclick="NightShiftManager.saveConfigFromUI()"
                            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span>保存配置</span>
                        </button>
                    </div>
                </div>

                <div id="configValidationResult" class="mb-4 hidden"></div>

                <!-- 地区配置 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">地区配置</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">每日最少人数</label>
                            <input type="number" id="cfg_dailyMin" value="${sh.dailyMin || 1}" min="0" max="5"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                onchange="NightShiftManager.validateConfigField('dailyMin', this.value)">
                            <p class="text-xs text-gray-500 mt-1">范围: 0-5</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">每日最多人数</label>
                            <input type="number" id="cfg_dailyMax" value="${sh.dailyMax || 2}" min="0" max="5"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                onchange="NightShiftManager.validateConfigField('dailyMax', this.value)">
                            <p class="text-xs text-gray-500 mt-1">范围: 0-5</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">地点别名</label>
                            <input type="text" id="cfg_aliases" value="${(sh.aliases || []).join(', ')}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="上海,沪,SH">
                        </div>
                    </div>
                </div>

                <!-- 连续天数限制 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">连续天数限制（本月大夜上限）</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">男生每月上限</label>
                            <input type="number" id="cfg_maleMaxDaysPerMonth" value="${sh.maleMaxDaysPerMonth || 4}" min="3" max="7"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">范围: 3-7</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">女生每月上限</label>
                            <input type="number" id="cfg_femaleMaxDaysPerMonth" value="${sh.femaleMaxDaysPerMonth || 3}" min="3" max="7"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">范围: 3-7</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">男生连续天数</label>
                            <input type="number" id="cfg_maleConsecutiveDays" value="${sh.maleConsecutiveDays || 4}" min="3" max="7"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">女生连续天数</label>
                            <input type="number" id="cfg_femaleConsecutiveDays" value="${sh.femaleConsecutiveDays || 3}" min="3" max="7"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                    </div>
                </div>

                <!-- 约束规则 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">约束规则</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_checkBasicEligibility" ${cs.checkBasicEligibility !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_checkBasicEligibility" class="ml-2 text-gray-700">排除哺乳期/孕妇</label>
                        </div>
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_checkMenstrualPeriod" ${cs.checkMenstrualPeriod !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_checkMenstrualPeriod" class="ml-2 text-gray-700">排除生理期（女生）</label>
                        </div>
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_checkVacationConflict" ${cs.checkVacationConflict !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_checkVacationConflict" class="ml-2 text-gray-700">检查休假冲突</label>
                        </div>
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_vacationSkipLegal" ${cs.vacationSkipLegal !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_vacationSkipLegal" class="ml-2 text-gray-700">法定休跳过</label>
                        </div>
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_vacationSkipReq" ${cs.vacationSkipReq !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_vacationSkipReq" class="ml-2 text-gray-700">指定休假跳过</label>
                        </div>
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_allowMaleReduceTo3Days" ${cs.allowMaleReduceTo3Days !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_allowMaleReduceTo3Days" class="ml-2 text-gray-700">人力富足时男生可减少到3天</label>
                        </div>
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_allowMaleIncreaseTo5Days" ${cs.allowMaleIncreaseTo5Days !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_allowMaleIncreaseTo5Days" class="ml-2 text-gray-700">人力不足时男生可增加到5天</label>
                        </div>
                    </div>
                </div>

                <!-- 排班模式 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">排班模式</h3>
                    <div class="space-y-4">
                        <div class="flex items-center space-x-6">
                            <div class="flex items-center">
                                <input type="radio" id="cfg_mode_continuous" name="cfg_arrangementMode" value="continuous"
                                    ${cs.arrangementMode !== 'distributed' ? 'checked' : ''}
                                    class="w-5 h-5 text-blue-600 focus:ring-blue-500">
                                <label for="cfg_mode_continuous" class="ml-2 text-gray-700">连续模式</label>
                            </div>
                            <div class="flex items-center">
                                <input type="radio" id="cfg_mode_distributed" name="cfg_arrangementMode" value="distributed"
                                    ${cs.arrangementMode === 'distributed' ? 'checked' : ''}
                                    class="w-5 h-5 text-blue-600 focus:ring-blue-500">
                                <label for="cfg_mode_distributed" class="ml-2 text-gray-700">分散模式</label>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">最小间隔天数（分散模式）</label>
                            <input type="number" id="cfg_minIntervalDays" value="${cs.minIntervalDays || 7}" min="3" max="14"
                                class="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1 inline ml-2">范围: 3-14</p>
                        </div>
                    </div>
                </div>

                <!-- 女生优先策略 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">女生优先策略</h3>
                    <div class="space-y-4">
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_femalePriority_enabled" ${pri.femalePriority?.enabled !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                onchange="document.getElementById('femalePrioritySettings').style.display = this.checked ? 'block' : 'none'">
                            <label for="cfg_femalePriority_enabled" class="ml-2 text-gray-700">启用女生优先</label>
                        </div>
                        <div id="femalePrioritySettings" style="display: ${pri.femalePriority?.enabled !== false ? 'block' : 'none'}">
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">触发条件</label>
                                    <select id="cfg_femalePriority_applyCondition"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        <option value="sufficient" ${pri.femalePriority?.applyCondition !== 'always' ? 'selected' : ''}>人力富足时</option>
                                        <option value="always" ${pri.femalePriority?.applyCondition === 'always' ? 'selected' : ''}>总是</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">上月≥X天触发减少</label>
                                    <input type="number" id="cfg_femalePriority_minLastMonthDays" value="${pri.femalePriority?.minLastMonthDays || 4}" min="1" max="7"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">减少后目标天数</label>
                                    <input type="number" id="cfg_femalePriority_reducedDays" value="${pri.femalePriority?.reducedDays || 3}" min="1" max="7"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 上月权重配置 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">上月权重配置</h3>
                    <div class="space-y-4">
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_lastMonthWeight_enabled" ${pri.lastMonthWeight?.enabled !== false ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                onchange="document.getElementById('lastMonthWeightSettings').style.display = this.checked ? 'block' : 'none'">
                            <label for="cfg_lastMonthWeight_enabled" class="ml-2 text-gray-700">启用上月权重</label>
                        </div>
                        <div id="lastMonthWeightSettings" style="display: ${pri.lastMonthWeight?.enabled !== false ? 'block' : 'none'}">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">数据源</label>
                                    <select id="cfg_lastMonthWeight_dataSource"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        <option value="auto" ${pri.lastMonthWeight?.dataSource === 'auto' || !pri.lastMonthWeight?.dataSource ? 'selected' : ''}>自动</option>
                                        <option value="staffField" ${pri.lastMonthWeight?.dataSource === 'staffField' ? 'selected' : ''}>人员字段</option>
                                        <option value="history" ${pri.lastMonthWeight?.dataSource === 'history' ? 'selected' : ''}>历史记录</option>
                                    </select>
                                </div>
                            </div>
                            <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                                <p class="text-sm font-medium text-gray-700 mb-2">分段配置</p>
                                <div class="text-sm text-gray-600">
                                    <p>上月 &lt; ${pri.lastMonthWeight?.segments?.[0]?.max || 4} 天 → 优先级 ${pri.lastMonthWeight?.segments?.[0]?.priority || 100} → 目标 ${pri.lastMonthWeight?.segments?.[0]?.targetDays || 4} 天</p>
                                    <p>上月 ≥ ${pri.lastMonthWeight?.segments?.[1]?.min || 4} 天 → 优先级 ${pri.lastMonthWeight?.segments?.[1]?.priority || 50} → 目标 ${pri.lastMonthWeight?.segments?.[1]?.targetDays || 3} 天</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 严格连续排班配置 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">严格连续排班配置</h3>
                    <div class="space-y-4">
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_strictContinuous_enabled" ${sc.enabled === true ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                onchange="document.getElementById('strictContinuousSettings').style.display = this.checked ? 'block' : 'none'">
                            <label for="cfg_strictContinuous_enabled" class="ml-2 text-gray-700">启用严格连续排班模式</label>
                        </div>
                        <div id="strictContinuousSettings" style="display: ${sc.enabled === true ? 'block' : 'none'}">
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">开工率</label>
                                    <input type="number" id="cfg_strictContinuous_rateSch" value="${sc.rateSch || 1.0}" min="0.1" max="1.0" step="0.1"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">夜班后休息天数</label>
                                    <input type="number" id="cfg_strictContinuous_postShiftRestDays" value="${sc.postShiftRestDays || 2}" min="0" max="7"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">最大连休上限</label>
                                    <input type="number" id="cfg_strictContinuous_maxConsecutiveRestLimit" value="${sc.maxConsecutiveRestLimit || 3}" min="0" max="10"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                    <p class="text-xs text-gray-500 mt-1">0=从排班周期管理获取</p>
                                </div>
                                <div class="flex items-center">
                                    <input type="checkbox" id="cfg_strictContinuous_isNul" ${sc.isNul !== false ? 'checked' : ''}
                                        class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                                    <label for="cfg_strictContinuous_isNul" class="ml-2 text-gray-700">启用精英轮空</label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 跨地区配置 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">跨地区配置</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">每天最少总人数</label>
                            <input type="number" id="cfg_totalDailyMin" value="${cr.totalDailyMin || 1}" min="0" max="5"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">每天最大总人数</label>
                            <input type="number" id="cfg_totalDailyMax" value="${cr.totalDailyMax || 2}" min="0" max="5"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div class="flex items-center">
                            <input type="checkbox" id="cfg_enableBackup" ${cr.enableBackup === true ? 'checked' : ''}
                                class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500">
                            <label for="cfg_enableBackup" class="ml-2 text-gray-700">启用跨地区补充</label>
                        </div>
                    </div>
                </div>

                <!-- 人力计算配置 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">人力计算配置</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">男生每月标准天数</label>
                            <input type="number" id="cfg_maleDaysPerMonth" value="${mc.maleDaysPerMonth || 4}" min="3" max="7"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">女生每月标准天数</label>
                            <input type="number" id="cfg_femaleDaysPerMonth" value="${mc.femaleDaysPerMonth || 3}" min="3" max="7"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">富裕阈值</label>
                            <input type="number" id="cfg_richThreshold" value="${mc.richThreshold || 0}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">不足阈值</label>
                            <input type="number" id="cfg_shortageThreshold" value="${mc.shortageThreshold || 0}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                    </div>
                </div>

                <div class="text-center text-sm text-gray-500 mt-4">
                    配置修改后请点击"保存配置"按钮保存更改
                </div>
                <input type="file" id="importConfigInput" accept=".json" style="display:none"
                    onchange="NightShiftManager.importConfigFromFile(this)">
            </div>
        `;
    },

    /**
     * 验证配置字段
     */
    validateConfigField(fieldName, value) {
        const validationRules = {
            dailyMin: { min: 0, max: 5 },
            dailyMax: { min: 0, max: 5 },
            maleMaxDaysPerMonth: { min: 3, max: 7 },
            femaleMaxDaysPerMonth: { min: 3, max: 7 },
            maleConsecutiveDays: { min: 3, max: 7 },
            femaleConsecutiveDays: { min: 3, max: 7 },
            minIntervalDays: { min: 3, max: 14 }
        };

        const rule = validationRules[fieldName];
        if (!rule) return true;

        const numValue = parseInt(value, 10);
        if (isNaN(numValue) || numValue < rule.min || numValue > rule.max) {
            this.showValidationResult(false, `${fieldName} 应该在 ${rule.min}-${rule.max} 之间`);
            return false;
        }

        // 特殊验证：dailyMax >= dailyMin
        if (fieldName === 'dailyMax') {
            const dailyMin = parseInt(document.getElementById('cfg_dailyMin')?.value || 0, 10);
            if (numValue < dailyMin) {
                this.showValidationResult(false, '每日最大人数必须大于等于每日最少人数');
                return false;
            }
        }
        if (fieldName === 'dailyMin') {
            const dailyMax = parseInt(document.getElementById('cfg_dailyMax')?.value || 5, 10);
            if (numValue > dailyMax) {
                this.showValidationResult(false, '每日最少人数必须小于等于每日最大人数');
                return false;
            }
        }

        this.showValidationResult(true, '验证通过');
        return true;
    },

    /**
     * 显示验证结果
     */
    showValidationResult(isValid, message) {
        const resultDiv = document.getElementById('configValidationResult');
        if (!resultDiv) return;

        resultDiv.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800');
        resultDiv.classList.add(isValid ? 'bg-green-100' : 'bg-red-100');
        resultDiv.textContent = message;
    },

    /**
     * 从UI收集配置并保存
     */
    async saveConfigFromUI() {
        try {
            console.log('[NightShiftManager] 开始保存配置...');

            // 确保配置已初始化
            if (typeof NightShiftConfigRules === 'undefined') {
                throw new Error('NightShiftConfigRules 未加载');
            }
            console.log('[NightShiftManager] NightShiftConfigRules 已加载');

            if (NightShiftConfigRules.init) {
                await NightShiftConfigRules.init();
            }
            console.log('[NightShiftManager] 配置已初始化');

            const currentConfig = NightShiftConfigRules.getConfig();
            console.log('[NightShiftManager] 当前配置:', currentConfig ? '已加载' : '为空');

            const updates = {
                regions: {
                    shanghai: {
                        dailyMin: parseInt(document.getElementById('cfg_dailyMin')?.value || 1, 10),
                        dailyMax: parseInt(document.getElementById('cfg_dailyMax')?.value || 2, 10),
                        aliases: (document.getElementById('cfg_aliases')?.value || '上海,沪,SH').split(',').map(s => s.trim()),
                        maleMaxDaysPerMonth: parseInt(document.getElementById('cfg_maleMaxDaysPerMonth')?.value || 4, 10),
                        femaleMaxDaysPerMonth: parseInt(document.getElementById('cfg_femaleMaxDaysPerMonth')?.value || 3, 10),
                        maleConsecutiveDays: parseInt(document.getElementById('cfg_maleConsecutiveDays')?.value || 4, 10),
                        femaleConsecutiveDays: parseInt(document.getElementById('cfg_femaleConsecutiveDays')?.value || 3, 10)
                    }
                },
                constraints: {
                    checkBasicEligibility: document.getElementById('cfg_checkBasicEligibility')?.checked,
                    checkMenstrualPeriod: document.getElementById('cfg_checkMenstrualPeriod')?.checked,
                    checkVacationConflict: document.getElementById('cfg_checkVacationConflict')?.checked,
                    vacationSkipLegal: document.getElementById('cfg_vacationSkipLegal')?.checked,
                    vacationSkipReq: document.getElementById('cfg_vacationSkipReq')?.checked,
                    allowMaleReduceTo3Days: document.getElementById('cfg_allowMaleReduceTo3Days')?.checked,
                    allowMaleIncreaseTo5Days: document.getElementById('cfg_allowMaleIncreaseTo5Days')?.checked,
                    arrangementMode: document.querySelector('input[name="cfg_arrangementMode"]:checked')?.value || 'continuous',
                    minIntervalDays: parseInt(document.getElementById('cfg_minIntervalDays')?.value || 7, 10)
                },
                priority: {
                    femalePriority: {
                        enabled: document.getElementById('cfg_femalePriority_enabled')?.checked,
                        applyCondition: document.getElementById('cfg_femalePriority_applyCondition')?.value,
                        minLastMonthDays: parseInt(document.getElementById('cfg_femalePriority_minLastMonthDays')?.value || 4, 10),
                        reducedDays: parseInt(document.getElementById('cfg_femalePriority_reducedDays')?.value || 3, 10)
                    },
                    lastMonthWeight: {
                        enabled: document.getElementById('cfg_lastMonthWeight_enabled')?.checked,
                        dataSource: document.getElementById('cfg_lastMonthWeight_dataSource')?.value
                    }
                },
                strictContinuous: {
                    enabled: document.getElementById('cfg_strictContinuous_enabled')?.checked,
                    rateSch: parseFloat(document.getElementById('cfg_strictContinuous_rateSch')?.value || 1.0),
                    postShiftRestDays: parseInt(document.getElementById('cfg_strictContinuous_postShiftRestDays')?.value || 2, 10),
                    maxConsecutiveRestLimit: parseInt(document.getElementById('cfg_strictContinuous_maxConsecutiveRestLimit')?.value || 3, 10),
                    isNul: document.getElementById('cfg_strictContinuous_isNul')?.checked !== false
                },
                crossRegion: {
                    totalDailyMin: parseInt(document.getElementById('cfg_totalDailyMin')?.value || 1, 10),
                    totalDailyMax: parseInt(document.getElementById('cfg_totalDailyMax')?.value || 2, 10),
                    enableBackup: document.getElementById('cfg_enableBackup')?.checked || false
                },
                manpowerCalculation: {
                    maleDaysPerMonth: parseInt(document.getElementById('cfg_maleDaysPerMonth')?.value || 4, 10),
                    femaleDaysPerMonth: parseInt(document.getElementById('cfg_femaleDaysPerMonth')?.value || 3, 10),
                    richThreshold: parseInt(document.getElementById('cfg_richThreshold')?.value || 0, 10),
                    shortageThreshold: parseInt(document.getElementById('cfg_shortageThreshold')?.value || 0, 10),
                    shortageIncreaseDays: 5
                }
            };
            console.log('[NightShiftManager] 待保存的updates:', updates);

            // 验证配置
            console.log('[NightShiftManager] 开始验证配置...');
            const validation = NightShiftConfigRules.validateConfig(updates);
            console.log('[NightShiftManager] 验证结果:', validation);

            if (!validation.valid) {
                alert('配置验证失败:\n' + validation.errors.join('\n'));
                return;
            }

            // 保存配置
            console.log('[NightShiftManager] 开始调用updateConfig...');
            await NightShiftConfigRules.updateConfig(updates);
            console.log('[NightShiftManager] 配置保存完成');

            this.showValidationResult(true, '配置已保存成功！');

            console.log('[NightShiftManager] 配置已保存:', updates);
        } catch (error) {
            console.error('[NightShiftManager] 保存配置失败:', error);
            console.error('[NightShiftManager] 错误堆栈:', error.stack);
            this.showValidationResult(false, '保存失败: ' + error.message);
        }
    },

    /**
     * 重置配置为默认
     */
    async resetConfigToDefault() {
        if (!confirm('确定要重置为默认配置吗？当前配置将会丢失。')) {
            return;
        }

        try {
            await NightShiftConfigRules.resetToDefault();
            this.showNightShiftConfigUI(); // 重新渲染
            this.showValidationResult(true, '已重置为默认配置');
            console.log('[NightShiftManager] 配置已重置为默认');
        } catch (error) {
            console.error('[NightShiftManager] 重置配置失败:', error);
            this.showValidationResult(false, '重置失败: ' + error.message);
        }
    },

    /**
     * 导出配置为JSON
     */
    exportConfigToJson() {
        const config = NightShiftConfigRules.getConfig();
        const jsonStr = JSON.stringify(config, null, 2);

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nightShiftConfig.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('[NightShiftManager] 配置已导出为 nightShiftConfig.json');
    },

    /**
     * 从JSON文件导入配置
     */
    importConfigFromFile(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonStr = e.target.result;
                const config = JSON.parse(jsonStr);

                // 验证配置
                const validation = NightShiftConfigRules.validateConfig(config);
                if (!validation.valid) {
                    alert('配置验证失败:\\n' + validation.errors.join('\\n'));
                    return;
                }

                // 设置配置
                NightShiftConfigRules.setConfig(config);

                // 保存到数据库
                await NightShiftConfigRules.updateConfig(config);

                // 重新渲染界面
                this.showNightShiftConfigUI();
                this.showValidationResult(true, '配置已导入成功！');

                console.log('[NightShiftManager] 配置已从文件导入');
            } catch (error) {
                console.error('[NightShiftManager] 导入配置失败:', error);
                alert('导入失败: ' + error.message);
            }
            // 清空input
            input.value = '';
        };
        reader.readAsText(file);
    },

    // ==================== 格式转换方法（新增） ====================

    /**
     * 将按人员组织的排班格式转换为按日期组织的格式
     * NightShiftManager 输出格式: { dateStr: [{ staffId, name, gender, ... }] }
     *
     * @param {Object} schedule - 按人员组织的排班表 { staffId: { dateStr: shiftType } }
     * @param {Array} staffData - 人员数据列表
     * @param {string} location - 地点
     * @returns {Object} 按日期组织的排班表 { dateStr: [{ ... }] }
     */
    convertToDateBasedFormat(schedule, staffData, location = '上海') {
        const dateBasedSchedule = {};

        // 构建人员信息映射
        const staffMap = {};
        staffData.forEach(staff => {
            const staffId = staff.id || staff.staffId;
            staffMap[staffId] = {
                staffId: staffId,
                name: staff.name,
                gender: staff.gender,
                location: staff.location || location
            };
        });

        // 转换格式
        for (const [staffId, dates] of Object.entries(schedule)) {
            for (const [dateStr, shiftType] of Object.entries(dates)) {
                if (shiftType === 'NIGHT') {
                    if (!dateBasedSchedule[dateStr]) {
                        dateBasedSchedule[dateStr] = [];
                    }
                    const staffInfo = staffMap[staffId] || { staffId, name: staffId, location };
                    dateBasedSchedule[dateStr].push({
                        ...staffInfo,
                        date: dateStr,
                        shiftType: 'NIGHT'
                    });
                }
            }
        }

        return dateBasedSchedule;
    },

    /**
     * 将按日期组织的排班格式转换为按人员组织的格式
     * NightShiftSolver 输出格式: { staffId: { dateStr: 'NIGHT' } }
     *
     * @param {Object} dateBasedSchedule - 按日期组织的排班表 { dateStr: [{ staffId, ... }] }
     * @returns {Object} 按人员组织的排班表 { staffId: { dateStr: shiftType } }
     */
    convertToStaffBasedFormat(dateBasedSchedule) {
        const staffBasedSchedule = {};

        for (const [dateStr, assignments] of Object.entries(dateBasedSchedule)) {
            assignments.forEach(assignment => {
                const staffId = assignment.staffId;
                if (!staffBasedSchedule[staffId]) {
                    staffBasedSchedule[staffId] = {};
                }
                staffBasedSchedule[staffId][dateStr] = assignment.shiftType || 'NIGHT';
            });
        }

        return staffBasedSchedule;
    },

    /**
     * 验证排班格式
     * @param {Object} schedule - 排班表
     * @param {string} expectedFormat - 期望格式: 'date' | 'staff'
     * @returns {Object} { valid: boolean, format: string, errors: string[] }
     */
    validateScheduleFormat(schedule, expectedFormat = 'date') {
        const errors = [];

        // 检查是否是对象
        if (typeof schedule !== 'object' || schedule === null) {
            return { valid: false, format: 'unknown', errors: ['排班表必须是对象'] };
        }

        // 检查是否为空对象
        if (Object.keys(schedule).length === 0) {
            return { valid: true, format: 'empty', errors: [] };
        }

        // 检测格式
        let detectedFormat = 'unknown';
        const firstKey = Object.keys(schedule)[0];
        const firstValue = schedule[firstKey];

        if (typeof firstValue === 'object' && firstValue !== null) {
            // 检查值的类型：如果值是数组，则是 date 格式
            // 如果值是对象（包含日期→班次映射），则是 staff 格式
            if (Array.isArray(firstValue)) {
                detectedFormat = 'date';
            } else {
                const innerKeys = Object.keys(firstValue);
                const innerValue = firstValue[innerKeys[0]];
                if (typeof innerValue === 'string') {
                    detectedFormat = 'staff';
                }
            }
        }

        const isValid = detectedFormat === expectedFormat || detectedFormat === 'empty';

        if (!isValid) {
            errors.push(`期望格式: ${expectedFormat}, 检测到格式: ${detectedFormat}`);
        }

        return {
            valid: isValid,
            format: detectedFormat,
            errors
        };
    },

    /**
     * 统一排班结果格式
     * 确保 NightShiftManager 和 NightShiftSolver 的输出格式一致
     *
     * @param {Object} schedule - 排班表
     * @param {Array} staffData - 人员数据
     * @param {string} source - 来源: 'manager' | 'solver'
     * @returns {Object} 统一格式的排班表
     */
    normalizeScheduleFormat(schedule, staffData, source = 'manager') {
        // 检测当前格式
        const validation = this.validateScheduleFormat(schedule, 'date');

        if (validation.valid) {
            console.log(`[NightShiftManager] 排班格式已是标准格式 (${source})`);
            return schedule;
        }

        // 如果是 staff 格式，转换为 date 格式
        if (validation.format === 'staff') {
            console.log(`[NightShiftManager] 检测到 staff 格式，转换为 date 格式 (${source})`);
            return this.convertToDateBasedFormat(schedule, staffData);
        }

        console.warn(`[NightShiftManager] 无法识别的排班格式: ${validation.format}`);
        return schedule;
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.NightShiftManager = NightShiftManager;
}
