/**
 * CSP求解器 - 白班排班算法（V2）
 *
 * 目标：
 * 1. 每人当月固定班别（A1/A/A2/B1/B2）
 * 2. 每人白班天数下限为应上白班天数；可按配置允许最多 +1 天（默认开启）
 * 3. 每日班别最低人力（硬约束）
 * 4. 夜班当天不可白班，且遵从已传入的休假/休整约束
 * 5. 无解时按规则置空 ANNUAL/LEGAL（轮转、积分优先）
 * 6. 仍无解时逐级放宽连续上/休班上限
 * 7. 输出附带：date->职能统计、年度累计增量
 */

const CSPSolver = {
    SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2'],
    FUNCTION_TYPES: ['网', '天', '微', '追', '收', '综', '银B', '毛', '星'],
    MAJOR_FUNCTIONS: ['网', '天', '微'],
    BALANCE_FUNCTIONS: ['追', '收', '综', '银B', '毛', '星'],

    defaultConfig: {
        maxAttemptsBase: 60,
        maxStepsPerAttempt: 4000,
        seedsPerLevel: 8,
        functionBalanceM: 2,
        // 员工福利偏好：更偏好形成>=4天连续上班、>=4天连续休息
        preferredMinWorkDays: 4,
        preferredMinRestDays: 4,
        // 最长连续休假软目标（可配置）
        preferredLongestRestDays: 4,
        // 连续休假软目标开关：关闭时不执行最长连休优化与对应软惩罚
        continuousRestSoftGoalEnabled: true,
        // 定向修复规则：允许少量人员多上白班（每人最多 1 天）
        maxExtraDayPerStaff: 1,
        // 应急补位允许突破 maxExtraDayPerStaff 的附加上限（默认 0，表示不突破）
        maxEmergencyExtraDayPerStaff: 0,
        // 硬约束兜底补缺班循环轮数（在常规修复后仍存在缺班时触发）
        hardShortageRescueRounds: 2,
        // 当日最低人力无法满足时，允许少量“超目标补位”（以目标违约替代班别缺口）
        allowEmergencyOverTarget: true,
        // 人员级额外上班天数白名单（可覆盖统一上限）
        staffExtraAllowanceDays: {},
        // true 时仅使用 staffExtraAllowanceDays，不再回退到统一上限
        useStaffExtraAllowanceOnly: false,
        // 当启用 staffExtraAllowanceDays 时，将其作为“应上白班天数”的强制增量
        enforcePlannedExtraAsTarget: true,
        maxVacationClearSteps: 300,
        visualization: {
            enabled: true,
            // 重点跟踪日期（MM-DD）
            watchMonthDays: ['02-03', '02-24', '02-25'],
            // 每多少次尝试打印一次阶段性结果
            logEveryAttempts: 20,
            // 每个 clearStep 仅追踪首个 attempt 的构建过程，避免日志爆炸
            traceFirstAttemptEachStep: true
        },
        // L0 是默认口径；失败后逐级放宽
        relaxLevels: [
            { name: 'L0', minWork: 3, maxWork: 6, minRest: 2, maxRest: 4 },
            { name: 'L1', minWork: 2, maxWork: 7, minRest: 1, maxRest: 4 },
            { name: 'L2', minWork: 2, maxWork: 7, minRest: 1, maxRest: 5 },
            { name: 'L3', minWork: 1, maxWork: 8, minRest: 1, maxRest: 5 }
        ],
        // 你提供的“全量(沪+蓉)日常底线”按职能汇总（总计 30）
        // 上海目标按 1/3
        globalDailyFunctionBaseline: {
            '网': 9,
            '天': 3,
            '微': 5,
            '追': 2,
            '收': 1,
            '综': 1,
            '银B': 3,
            '毛': 2,
            '星': 4
        },
        // 当天白班总人数达到阈值时，保证关键职能每日最小覆盖
        dailyFunctionMinThreshold: 2,
        dailyFunctionMinima: {},
        // 职能分配模式：monthly=按月比例优先，daily=按天比例优先
        functionAllocationMode: 'monthly',
        // 职能基线口径：global=沪蓉总量基线（内部按1/3折算上海）；shanghai=已是上海口径
        functionBaselineScope: 'global',
        // true: 每人网/天/微按最低人力基线比例约束；false: 仅约束其余六类职能均衡
        majorFunctionPersonalRatioEnabled: true,
        // 同班别内“六类职能总量”人员差异容忍值（软约束）
        shiftBalanceSixTotalTolerance: 1,
        // 额外加班公平：高于平均“应上白班天数”的员工，尽量少加班；低于平均者优先补位
        extraByTargetAvgBiasEnabled: true,
        // 候选人打分中，按“目标天数相对均值”的偏置权重
        extraByTargetAvgScoreWeight: 180,
        // 候选人打分中，对“已超目标多少天”附加惩罚
        extraOverTargetLevelPenaltyWeight: 120,
        // 额外上限按目标天数动态收紧：高于均值每 N 天，cap 减少 M 天
        extraCapHighTargetReduceStepDays: 2,
        extraCapHighTargetReducePerStep: 1
    },

    async generateDayShiftSchedule(params) {
        const {
            staffData = [],
            scheduleConfig,
            personalRequests = {},
            restDays = {},
            nightSchedule = {},
            rules = {}
        } = params || {};

        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            throw new Error('排班周期未配置');
        }

        const config = this.buildConfig(rules);
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);

        const staffList = staffData.map((s) => {
            const sid = this.normalizeStaffId(s);
            return {
                ...s,
                _sid: sid,
                _score: this.normalizeNumber(s.score, 0),
                _name: s.name || sid
            };
        }).filter(s => !!s._sid);

        if (staffList.length === 0) {
            return {
                schedule: {},
                stats: {
                    totalAssignments: 0,
                    errors: ['无可用人员数据']
                },
                dailyFunctionStats: {},
                yearlyFunctionDelta: {}
            };
        }

        const requestState = this.normalizeRequestState(personalRequests, staffList, dateList);
        const nightMap = this.normalizeNightSchedule(nightSchedule, staffList, dateList);
        const dailyMinDemand = this.getDailyMinimumDemand(dateList);
        const targetDaysBase = this.buildTargetDays(staffList, dateList, restDays, requestState, nightMap);
        const targetAdjust = this.applyPlannedExtraTargetDays(targetDaysBase, staffList, config);
        const targetDays = targetAdjust.targetDays;

        console.log('[CSPSolverV2] 开始白班求解');
        console.log('  人员数:', staffList.length, '日期数:', dateList.length);

        const solveResult = this.solveWithEscalation({
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            config
        });

        const functionResult = this.assignFunctions({
            scheduleByStaff: solveResult.scheduleByStaff,
            dateList,
            staffList,
            functionBalanceM: config.functionBalanceM,
            shiftBalanceSixTotalTolerance: Math.max(0, Math.floor(this.normalizeNumber(config.shiftBalanceSixTotalTolerance, 1))),
            globalDailyFunctionBaseline: config.globalDailyFunctionBaseline,
            dailyFunctionMinThreshold: config.dailyFunctionMinThreshold,
            dailyFunctionMinima: config.dailyFunctionMinima,
            functionAllocationMode: config.functionAllocationMode,
            functionBaselineScope: config.functionBaselineScope,
            majorFunctionPersonalRatioEnabled: config.majorFunctionPersonalRatioEnabled !== false
        });

        const yearlyDelta = this.buildYearlyFunctionDelta(functionResult.staffFunctionCounts);
        await this.persistYearlyFunctionDelta(staffList, yearlyDelta);

        const stats = {
            totalAssignments: solveResult.totalAssignments,
            shiftDistribution: solveResult.shiftDistribution,
            monthlyShiftAssignments: solveResult.monthlyShiftAssignments,
            targetDaysByStaff: targetDays,
            extraDayUsage: solveResult.extraDayUsage || {},
            extraDayTotal: solveResult.extraDayTotal || 0,
            plannedExtraTargetByStaff: targetAdjust.plannedExtraByStaff || {},
            plannedExtraTargetTotal: targetAdjust.plannedExtraTotal || 0,
            relaxationLevel: solveResult.relaxationLevel,
            attempts: solveResult.attempts,
            vacationCleared: solveResult.vacationCleared,
            hardViolations: solveResult.hardViolations,
            softPenalty: solveResult.softPenalty,
            warnings: solveResult.warnings.concat(functionResult.warnings),
            errors: solveResult.errors,
            dailyFunctionStats: functionResult.dailyFunctionStats,
            yearlyFunctionDelta: yearlyDelta,
            functionTargets: functionResult.functionTargets,
            shanghaiFunctionThirdTarget: functionResult.shanghaiFunctionThirdTarget,
            shanghaiFunctionActualTotal: functionResult.actualTotalAssignments
        };

        return {
            schedule: solveResult.scheduleByStaff,
            functionSchedule: functionResult.functionScheduleByStaff,
            stats,
            dailyFunctionStats: functionResult.dailyFunctionStats,
            yearlyFunctionDelta: yearlyDelta,
            meta: {
                vacationCleared: solveResult.vacationCleared,
                monthlyShiftAssignments: solveResult.monthlyShiftAssignments,
                requestStateAfterSolve: solveResult.requestStateAfterSolve
            }
        };
    },

    buildConfig(rules) {
        const fromRules = (rules && typeof rules === 'object') ? rules : {};
        const merged = this.deepMerge(this.defaultConfig, fromRules);
        const runtimeSolverCfg = (fromRules.cspSolver && typeof fromRules.cspSolver === 'object')
            ? fromRules.cspSolver
            : {};

        if (typeof runtimeSolverCfg.maxIterations === 'number' && runtimeSolverCfg.maxIterations > 0) {
            merged.maxAttemptsBase = Math.max(10, Math.floor(runtimeSolverCfg.maxIterations / 10));
        }
        if (typeof runtimeSolverCfg.backtrackLimit === 'number' && runtimeSolverCfg.backtrackLimit > 0) {
            merged.maxStepsPerAttempt = Math.max(1000, runtimeSolverCfg.backtrackLimit * 40);
        }
        if (typeof runtimeSolverCfg.maxExtraDayPerStaff === 'number' && runtimeSolverCfg.maxExtraDayPerStaff >= 0) {
            merged.maxExtraDayPerStaff = Math.floor(runtimeSolverCfg.maxExtraDayPerStaff);
        }
        if (typeof runtimeSolverCfg.maxEmergencyExtraDayPerStaff === 'number' && runtimeSolverCfg.maxEmergencyExtraDayPerStaff >= 0) {
            merged.maxEmergencyExtraDayPerStaff = Math.floor(runtimeSolverCfg.maxEmergencyExtraDayPerStaff);
        }
        if (typeof runtimeSolverCfg.hardShortageRescueRounds === 'number' && runtimeSolverCfg.hardShortageRescueRounds >= 0) {
            merged.hardShortageRescueRounds = Math.max(0, Math.floor(runtimeSolverCfg.hardShortageRescueRounds));
        }
        if (typeof runtimeSolverCfg.shiftBalanceSixTotalTolerance === 'number' && runtimeSolverCfg.shiftBalanceSixTotalTolerance >= 0) {
            merged.shiftBalanceSixTotalTolerance = Math.floor(runtimeSolverCfg.shiftBalanceSixTotalTolerance);
        }
        if (typeof runtimeSolverCfg.extraByTargetAvgBiasEnabled === 'boolean') {
            merged.extraByTargetAvgBiasEnabled = runtimeSolverCfg.extraByTargetAvgBiasEnabled;
        }
        if (typeof runtimeSolverCfg.extraByTargetAvgScoreWeight === 'number' && runtimeSolverCfg.extraByTargetAvgScoreWeight >= 0) {
            merged.extraByTargetAvgScoreWeight = Number(runtimeSolverCfg.extraByTargetAvgScoreWeight);
        }
        if (typeof runtimeSolverCfg.extraOverTargetLevelPenaltyWeight === 'number' && runtimeSolverCfg.extraOverTargetLevelPenaltyWeight >= 0) {
            merged.extraOverTargetLevelPenaltyWeight = Number(runtimeSolverCfg.extraOverTargetLevelPenaltyWeight);
        }
        if (typeof runtimeSolverCfg.extraCapHighTargetReduceStepDays === 'number' && runtimeSolverCfg.extraCapHighTargetReduceStepDays > 0) {
            merged.extraCapHighTargetReduceStepDays = Math.max(1, Math.floor(runtimeSolverCfg.extraCapHighTargetReduceStepDays));
        }
        if (typeof runtimeSolverCfg.extraCapHighTargetReducePerStep === 'number' && runtimeSolverCfg.extraCapHighTargetReducePerStep >= 0) {
            merged.extraCapHighTargetReducePerStep = Math.max(0, Math.floor(runtimeSolverCfg.extraCapHighTargetReducePerStep));
        }
        if (typeof runtimeSolverCfg.continuousRestSoftGoalEnabled === 'boolean') {
            merged.continuousRestSoftGoalEnabled = runtimeSolverCfg.continuousRestSoftGoalEnabled;
        }

        // 如果存在 DayShiftRules 配置，可覆盖部分求解参数
        try {
            if (typeof DayShiftRules !== 'undefined' && DayShiftRules.getRules) {
                const cfg = DayShiftRules.getRules() || {};
                if (cfg.cspSolver) {
                    const solverCfg = cfg.cspSolver;
                    const ruleOverride = (fromRules && fromRules.cspSolver && typeof fromRules.cspSolver === 'object')
                        ? fromRules.cspSolver
                        : {};
                    const hasRuleMaxIterations = Number.isFinite(Number(ruleOverride.maxIterations)) && Number(ruleOverride.maxIterations) > 0;
                    const hasRuleBacktrackLimit = Number.isFinite(Number(ruleOverride.backtrackLimit)) && Number(ruleOverride.backtrackLimit) > 0;
                    const hasRuleMaxExtra = Number.isFinite(Number(ruleOverride.maxExtraDayPerStaff)) && Number(ruleOverride.maxExtraDayPerStaff) >= 0;
                    const hasRuleMaxEmergencyExtra = Number.isFinite(Number(ruleOverride.maxEmergencyExtraDayPerStaff)) && Number(ruleOverride.maxEmergencyExtraDayPerStaff) >= 0;
                    const hasRuleShiftBalanceSixTotalTolerance = Number.isFinite(Number(ruleOverride.shiftBalanceSixTotalTolerance)) && Number(ruleOverride.shiftBalanceSixTotalTolerance) >= 0;
                    const hasRuleExtraByTargetAvgBiasEnabled = typeof ruleOverride.extraByTargetAvgBiasEnabled === 'boolean';
                    const hasRuleExtraByTargetAvgScoreWeight = Number.isFinite(Number(ruleOverride.extraByTargetAvgScoreWeight)) && Number(ruleOverride.extraByTargetAvgScoreWeight) >= 0;
                    const hasRuleExtraOverTargetLevelPenaltyWeight = Number.isFinite(Number(ruleOverride.extraOverTargetLevelPenaltyWeight)) && Number(ruleOverride.extraOverTargetLevelPenaltyWeight) >= 0;
                    const hasRuleExtraCapHighTargetReduceStepDays = Number.isFinite(Number(ruleOverride.extraCapHighTargetReduceStepDays)) && Number(ruleOverride.extraCapHighTargetReduceStepDays) > 0;
                    const hasRuleExtraCapHighTargetReducePerStep = Number.isFinite(Number(ruleOverride.extraCapHighTargetReducePerStep)) && Number(ruleOverride.extraCapHighTargetReducePerStep) >= 0;
                    const hasRuleContinuousRestSoftGoalEnabled = typeof ruleOverride.continuousRestSoftGoalEnabled === 'boolean';

                    if (!hasRuleMaxIterations && typeof solverCfg.maxIterations === 'number' && solverCfg.maxIterations > 0) {
                        merged.maxAttemptsBase = Math.max(10, Math.floor(solverCfg.maxIterations / 10));
                    }
                    if (!hasRuleBacktrackLimit && typeof solverCfg.backtrackLimit === 'number' && solverCfg.backtrackLimit > 0) {
                        merged.maxStepsPerAttempt = Math.max(1000, solverCfg.backtrackLimit * 40);
                    }
                    if (!hasRuleMaxExtra && typeof solverCfg.maxExtraDayPerStaff === 'number' && solverCfg.maxExtraDayPerStaff >= 0) {
                        merged.maxExtraDayPerStaff = Math.floor(solverCfg.maxExtraDayPerStaff);
                    }
                    if (!hasRuleMaxEmergencyExtra && typeof solverCfg.maxEmergencyExtraDayPerStaff === 'number' && solverCfg.maxEmergencyExtraDayPerStaff >= 0) {
                        merged.maxEmergencyExtraDayPerStaff = Math.floor(solverCfg.maxEmergencyExtraDayPerStaff);
                    }
                    if (typeof ruleOverride.hardShortageRescueRounds !== 'number'
                        && typeof solverCfg.hardShortageRescueRounds === 'number'
                        && solverCfg.hardShortageRescueRounds >= 0) {
                        merged.hardShortageRescueRounds = Math.max(0, Math.floor(solverCfg.hardShortageRescueRounds));
                    }
                    if (!hasRuleShiftBalanceSixTotalTolerance && typeof solverCfg.shiftBalanceSixTotalTolerance === 'number' && solverCfg.shiftBalanceSixTotalTolerance >= 0) {
                        merged.shiftBalanceSixTotalTolerance = Math.floor(solverCfg.shiftBalanceSixTotalTolerance);
                    }
                    if (!hasRuleExtraByTargetAvgBiasEnabled && typeof solverCfg.extraByTargetAvgBiasEnabled === 'boolean') {
                        merged.extraByTargetAvgBiasEnabled = solverCfg.extraByTargetAvgBiasEnabled;
                    }
                    if (!hasRuleExtraByTargetAvgScoreWeight && typeof solverCfg.extraByTargetAvgScoreWeight === 'number' && solverCfg.extraByTargetAvgScoreWeight >= 0) {
                        merged.extraByTargetAvgScoreWeight = Number(solverCfg.extraByTargetAvgScoreWeight);
                    }
                    if (!hasRuleExtraOverTargetLevelPenaltyWeight && typeof solverCfg.extraOverTargetLevelPenaltyWeight === 'number' && solverCfg.extraOverTargetLevelPenaltyWeight >= 0) {
                        merged.extraOverTargetLevelPenaltyWeight = Number(solverCfg.extraOverTargetLevelPenaltyWeight);
                    }
                    if (!hasRuleExtraCapHighTargetReduceStepDays && typeof solverCfg.extraCapHighTargetReduceStepDays === 'number' && solverCfg.extraCapHighTargetReduceStepDays > 0) {
                        merged.extraCapHighTargetReduceStepDays = Math.max(1, Math.floor(solverCfg.extraCapHighTargetReduceStepDays));
                    }
                    if (!hasRuleExtraCapHighTargetReducePerStep && typeof solverCfg.extraCapHighTargetReducePerStep === 'number' && solverCfg.extraCapHighTargetReducePerStep >= 0) {
                        merged.extraCapHighTargetReducePerStep = Math.max(0, Math.floor(solverCfg.extraCapHighTargetReducePerStep));
                    }
                    if (!hasRuleContinuousRestSoftGoalEnabled && typeof solverCfg.continuousRestSoftGoalEnabled === 'boolean') {
                        merged.continuousRestSoftGoalEnabled = solverCfg.continuousRestSoftGoalEnabled;
                    }
                    if (solverCfg.visualization && typeof solverCfg.visualization === 'object') {
                        merged.visualization = this.deepMerge(merged.visualization || {}, solverCfg.visualization);
                    }
                }
            }
        } catch (error) {
            console.warn('[CSPSolverV2] 读取 DayShiftRules 失败，使用默认参数:', error);
        }

        return merged;
    },

    solveWithEscalation(ctx) {
        const {
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            config
        } = ctx;

        const scoresByStaff = {};
        staffList.forEach((s) => {
            scoresByStaff[s._sid] = this.normalizeNumber(s._score, 0);
        });

        let mutableRequestState = this.cloneDeep(requestState);

        const clearTrack = {};
        staffList.forEach((s) => {
            clearTrack[s._sid] = 0;
        });

        const vacationCleared = [];
        const warnings = [];
        const errors = [];

        let best = null;
        let totalAttempts = 0;
        const watchDates = this.resolveWatchDates(dateList, config.visualization);

        const totalClearable = Object.values(mutableRequestState).reduce((sum, req) => {
            return sum + Object.values(req || {}).filter(t => t === 'ANNUAL' || t === 'LEGAL' || t === 'REQ').length;
        }, 0);
        const maxClearSteps = Math.min(config.maxVacationClearSteps, totalClearable);

        for (let levelIndex = 0; levelIndex < config.relaxLevels.length; levelIndex++) {
            const relax = config.relaxLevels[levelIndex];
            console.log(`[CSPSolverV2] 进入放宽层级 ${relax.name}`);

            // 每个层级都从当前置空状态开始尝试，逐步增加置空
            for (let clearStep = 0; clearStep <= maxClearSteps; clearStep++) {
                const isClearStep = clearStep > 0;
                const searchConfig = {
                    ...config,
                    maxAttemptsBase: isClearStep ? Math.min(12, config.maxAttemptsBase) : config.maxAttemptsBase,
                    seedsPerLevel: isClearStep ? Math.min(3, config.seedsPerLevel) : config.seedsPerLevel
                };

                const tryResult = this.solveUnderCurrentState({
                    staffList,
                    dateList,
                    requestState: mutableRequestState,
                    nightMap,
                    dailyMinDemand,
                    targetDays,
                    relax,
                    config: searchConfig,
                    seedBase: levelIndex * 100000 + clearStep * 1000,
                    watchDates,
                    stepLabel: `${relax.name}-clear${clearStep}`
                });

                totalAttempts += tryResult.attemptCount;

                this.logStepSummary({
                    level: relax.name,
                    clearStep,
                    tryResult,
                    watchDates,
                    dailyMinDemand,
                    totalAttempts
                });

                if (!best || tryResult.score < best.score) {
                    best = {
                        ...tryResult,
                        relaxationLevel: relax.name,
                        requestStateAfterSolve: this.cloneDeep(mutableRequestState),
                        vacationCleared: vacationCleared.slice(),
                        attempts: totalAttempts
                    };
                }

                const hardOk = tryResult.hardViolations.total === 0;
                const targetOk = tryResult.targetMismatchTotal === 0;

                if (hardOk && targetOk) {
                    return {
                        scheduleByStaff: tryResult.scheduleByStaff,
                        totalAssignments: tryResult.totalAssignments,
                        shiftDistribution: tryResult.shiftDistribution,
                        monthlyShiftAssignments: tryResult.monthlyShiftAssignments,
                        relaxationLevel: relax.name,
                        attempts: totalAttempts,
                        vacationCleared: vacationCleared.slice(),
                        hardViolations: tryResult.hardViolations,
                        softPenalty: tryResult.softPenalty,
                        extraDayUsage: tryResult.extraDayUsage || {},
                        extraDayTotal: tryResult.extraDayTotal || 0,
                        warnings,
                        errors,
                        requestStateAfterSolve: this.cloneDeep(mutableRequestState)
                    };
                }

                // 当前层级失败 -> 按规则置空 ANNUAL/LEGAL
                const clearTarget = this.pickNextVacationToClear({
                    requestState: mutableRequestState,
                    scoresByStaff,
                    clearTrack,
                    rng: this.createSeededRandom(levelIndex * 1000000 + clearStep + 17),
                    shortageByDate: tryResult.hardViolations.shortageByDate
                });

                if (!clearTarget) {
                    break;
                }

                if (mutableRequestState[clearTarget.staffId]) {
                    delete mutableRequestState[clearTarget.staffId][clearTarget.dateStr];
                }

                clearTrack[clearTarget.staffId] = (clearTrack[clearTarget.staffId] || 0) + 1;
                vacationCleared.push(clearTarget);
                this.logVacationClearAction(relax.name, clearStep, clearTarget, clearTrack[clearTarget.staffId]);
            }

            // 下一个放宽层级沿用已置空状态继续
            warnings.push(`层级 ${relax.name} 未找到完全可行解，升级放宽`);
        }

        if (!best) {
            return {
                scheduleByStaff: {},
                totalAssignments: 0,
                shiftDistribution: {},
                monthlyShiftAssignments: {},
                relaxationLevel: 'NONE',
                attempts: totalAttempts,
                vacationCleared,
                hardViolations: { total: Number.MAX_SAFE_INTEGER, shortageByDate: {} },
                softPenalty: Number.MAX_SAFE_INTEGER,
                extraDayUsage: {},
                extraDayTotal: 0,
                warnings,
                errors: ['未找到任何可用候选方案'],
                requestStateAfterSolve: mutableRequestState
            };
        }

        warnings.push('返回最小违约解（已尝试置空特殊休假与放宽连续约束）');

        return {
            scheduleByStaff: best.scheduleByStaff,
            totalAssignments: best.totalAssignments,
            shiftDistribution: best.shiftDistribution,
            monthlyShiftAssignments: best.monthlyShiftAssignments,
            relaxationLevel: best.relaxationLevel,
            attempts: best.attempts,
            vacationCleared: best.vacationCleared,
            hardViolations: best.hardViolations,
            softPenalty: best.softPenalty,
            extraDayUsage: best.extraDayUsage || {},
            extraDayTotal: best.extraDayTotal || 0,
            warnings,
            errors,
            requestStateAfterSolve: best.requestStateAfterSolve
        };
    },

    solveUnderCurrentState(ctx) {
        const {
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            relax,
            config,
            seedBase,
            watchDates = [],
            stepLabel = ''
        } = ctx;

        let best = null;
        let attemptCount = 0;
        const visCfg = config.visualization || {};
        const logEveryAttempts = Math.max(1, this.normalizeNumber(visCfg.logEveryAttempts, 10));

        for (let seedOffset = 0; seedOffset < config.seedsPerLevel; seedOffset++) {
            const rng = this.createSeededRandom(seedBase + seedOffset + 1);

            for (let attempt = 0; attempt < config.maxAttemptsBase; attempt++) {
                attemptCount += 1;

                const monthlyShiftAssignments = this.assignMonthlyShifts({
                    staffList,
                    dateList,
                    requestState,
                    nightMap,
                    dailyMinDemand,
                    targetDays,
                    rng,
                    maxRepairSteps: Math.max(120, Math.floor(config.maxStepsPerAttempt / 20)),
                    config
                });

                const scheduleResult = this.buildScheduleForMonthlyShift({
                    staffList,
                    dateList,
                    requestState,
                    nightMap,
                    dailyMinDemand,
                    targetDays,
                    monthlyShiftAssignments,
                    relax,
                    rng,
                    maxSteps: config.maxStepsPerAttempt,
                    config,
                    trace: !!visCfg.enabled && !!visCfg.traceFirstAttemptEachStep && attempt === 0 && seedOffset === 0,
                    watchDates,
                    traceLabel: `${stepLabel || relax.name}-seed${seedOffset + 1}-try${attempt + 1}`
                });

                const prevBestScore = best ? best.score : Number.POSITIVE_INFINITY;
                const improved = scheduleResult.score < prevBestScore;
                if (!best || improved) {
                    best = scheduleResult;
                }

                const shouldLogAttempt =
                    !!visCfg.enabled &&
                    (improved ||
                        attemptCount === 1 ||
                        attemptCount % logEveryAttempts === 0 ||
                        (scheduleResult.hardViolations && scheduleResult.hardViolations.total === 0));

                if (shouldLogAttempt) {
                    this.logAttemptSummary({
                        stepLabel: stepLabel || relax.name,
                        seedOffset,
                        attempt,
                        attemptCount,
                        scheduleResult,
                        watchDates,
                        dailyMinDemand
                    });
                }

                if (scheduleResult.hardViolations.total === 0 && scheduleResult.targetMismatchTotal === 0) {
                    return {
                        ...scheduleResult,
                        attemptCount
                    };
                }
            }
        }

        return {
            ...best,
            attemptCount
        };
    },

    assignMonthlyShifts(ctx) {
        const {
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            rng,
            maxRepairSteps,
            config = {}
        } = ctx;

        const staffIds = staffList.map(s => s._sid);
        const staffIdSet = new Set(staffIds);
        const forcedRaw = (config && config.forcedMonthlyShiftByStaff && typeof config.forcedMonthlyShiftByStaff === 'object')
            ? config.forcedMonthlyShiftByStaff
            : {};
        const preferredRaw = (config && config.preferredMonthlyShiftByStaff && typeof config.preferredMonthlyShiftByStaff === 'object')
            ? config.preferredMonthlyShiftByStaff
            : {};
        const forcedShiftByStaff = {};
        const preferredShiftByStaff = {};
        Object.keys(forcedRaw || {}).forEach((rawSid) => {
            const sid = String(rawSid || '').trim();
            const shift = String(forcedRaw[rawSid] || '').trim();
            if (!sid || !staffIdSet.has(sid)) return;
            if (!this.SHIFT_TYPES.includes(shift)) return;
            forcedShiftByStaff[sid] = shift;
        });
        Object.keys(preferredRaw || {}).forEach((rawSid) => {
            const sid = String(rawSid || '').trim();
            const shift = String(preferredRaw[rawSid] || '').trim();
            if (!sid || !staffIdSet.has(sid)) return;
            if (!this.SHIFT_TYPES.includes(shift)) return;
            preferredShiftByStaff[sid] = shift;
        });
        const demandTotals = {};
        this.SHIFT_TYPES.forEach((shift) => {
            demandTotals[shift] = dateList.reduce((sum, d) => sum + (dailyMinDemand[d]?.[shift] || 0), 0);
        });
        const peakDemandByShift = {};
        this.SHIFT_TYPES.forEach((shift) => {
            peakDemandByShift[shift] = dateList.reduce((mx, d) => {
                const v = this.normalizeNumber(dailyMinDemand[d]?.[shift], 0);
                return v > mx ? v : mx;
            }, 0);
        });

        const availableCountByStaff = {};
        let totalAvailableCells = 0;
        staffIds.forEach((sid) => {
            let c = 0;
            dateList.forEach((date) => {
                if (!this.isHardBlocked(sid, date, requestState, nightMap)) {
                    c += 1;
                }
            });
            availableCountByStaff[sid] = c;
            totalAvailableCells += c;
        });
        const availRate = (staffIds.length > 0 && dateList.length > 0)
            ? (totalAvailableCells / (staffIds.length * dateList.length))
            : 1;
        const safeAvailRate = Math.max(0.35, Math.min(1, availRate));

        const totalDemand = this.SHIFT_TYPES.reduce((sum, shift) => sum + demandTotals[shift], 0);
        const n = staffIds.length;

        const shiftSlots = {};
        const reserveNeedByShift = {};
        let allocated = 0;
        this.SHIFT_TYPES.forEach((shift) => {
            const raw = totalDemand > 0 ? (demandTotals[shift] / totalDemand) * n : (n / this.SHIFT_TYPES.length);
            shiftSlots[shift] = Math.max(1, Math.floor(raw));
            const reserveNeed = Math.max(1, Math.ceil((peakDemandByShift[shift] || 0) / safeAvailRate));
            reserveNeedByShift[shift] = reserveNeed;
            allocated += shiftSlots[shift];
        });

        const forcedCountByShift = {};
        this.SHIFT_TYPES.forEach((shift) => { forcedCountByShift[shift] = 0; });
        Object.keys(forcedShiftByStaff).forEach((sid) => {
            const shift = forcedShiftByStaff[sid];
            if (!this.SHIFT_TYPES.includes(shift)) return;
            forcedCountByShift[shift] += 1;
        });
        this.SHIFT_TYPES.forEach((shift) => {
            const forcedNeed = Math.max(0, Math.floor(this.normalizeNumber(forcedCountByShift[shift], 0)));
            if (forcedNeed > shiftSlots[shift]) {
                allocated += (forcedNeed - shiftSlots[shift]);
                shiftSlots[shift] = forcedNeed;
            }
        });

        while (allocated < n) {
            const picked = this.SHIFT_TYPES.slice().sort((a, b) => {
                const gapA = Math.max(0, (reserveNeedByShift[a] || 0) - (shiftSlots[a] || 0));
                const gapB = Math.max(0, (reserveNeedByShift[b] || 0) - (shiftSlots[b] || 0));
                if (gapB !== gapA) return gapB - gapA;
                const peakA = peakDemandByShift[a] || 0;
                const peakB = peakDemandByShift[b] || 0;
                if (peakB !== peakA) return peakB - peakA;
                const da = demandTotals[a] || 0;
                const db = demandTotals[b] || 0;
                if (db !== da) return db - da;
                return rng.random() - 0.5;
            })[0];
            if (!picked) break;
            shiftSlots[picked] = (shiftSlots[picked] || 0) + 1;
            allocated += 1;
        }
        while (allocated > n) {
            const picked = this.randomPick(this.SHIFT_TYPES.filter((s) => {
                const forcedNeed = Math.max(0, Math.floor(this.normalizeNumber(forcedCountByShift[s], 0)));
                return shiftSlots[s] > Math.max(1, forcedNeed);
            }), rng);
            if (!picked) break;
            shiftSlots[picked] -= 1;
            allocated -= 1;
        }

        const sortedStaff = staffList.slice().sort((a, b) => {
            const aa = availableCountByStaff[a._sid] || 0;
            const ab = availableCountByStaff[b._sid] || 0;
            if (ab !== aa) return ab - aa;
            const ta = targetDays[a._sid] || 0;
            const tb = targetDays[b._sid] || 0;
            if (tb !== ta) return tb - ta;
            return (b._score || 0) - (a._score || 0);
        });

        const assignment = {};
        sortedStaff.forEach((s) => {
            const sid = s._sid;
            const forcedShift = forcedShiftByStaff[sid] || '';
            if (forcedShift && this.SHIFT_TYPES.includes(forcedShift)) {
                assignment[sid] = forcedShift;
                return;
            }
            const preferredShift = preferredShiftByStaff[sid] || '';
            const preferred = this.SHIFT_TYPES.slice().sort((x, y) => {
                const xBonus = (preferredShift && x === preferredShift) ? 0.35 : 0;
                const yBonus = (preferredShift && y === preferredShift) ? 0.35 : 0;
                const dx = (shiftSlots[x] - this.countAssignedShift(assignment, x)) + xBonus;
                const dy = (shiftSlots[y] - this.countAssignedShift(assignment, y)) + yBonus;
                if (dy !== dx) return dy - dx;
                const px = peakDemandByShift[x] || 0;
                const py = peakDemandByShift[y] || 0;
                if (py !== px) return py - px;
                const wx = demandTotals[x] || 0;
                const wy = demandTotals[y] || 0;
                if (wy !== wx) return wy - wx;
                return rng.random() - 0.5;
            });
            assignment[sid] = preferred[0] || this.SHIFT_TYPES[0];
        });

        // 先做“按班别总人天容量”修复：避免后半月某班别天然容量不足
        const capacityByShift = () => {
            const cap = {};
            this.SHIFT_TYPES.forEach((shift) => { cap[shift] = 0; });
            staffIds.forEach((sid) => {
                const shift = assignment[sid];
                if (cap[shift] == null) return;
                cap[shift] += Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
            });
            return cap;
        };
        const demandGapByShift = (cap) => {
            const out = {};
            this.SHIFT_TYPES.forEach((shift) => {
                out[shift] = Math.max(0, this.normalizeNumber(demandTotals[shift], 0) - this.normalizeNumber(cap[shift], 0));
            });
            return out;
        };
        const positiveDemandDatesByShift = {};
        this.SHIFT_TYPES.forEach((shift) => {
            positiveDemandDatesByShift[shift] = dateList.filter((date) => this.normalizeNumber(dailyMinDemand[date]?.[shift], 0) > 0);
        });
        for (let step = 0; step < Math.max(40, Math.floor(maxRepairSteps / 2)); step++) {
            const cap = capacityByShift();
            const gapByShift = demandGapByShift(cap);
            const shortageShift = this.SHIFT_TYPES.slice().sort((a, b) => {
                const ga = this.normalizeNumber(gapByShift[a], 0);
                const gb = this.normalizeNumber(gapByShift[b], 0);
                if (gb !== ga) return gb - ga;
                return this.normalizeNumber(demandTotals[b], 0) - this.normalizeNumber(demandTotals[a], 0);
            })[0];
            if (!shortageShift || this.normalizeNumber(gapByShift[shortageShift], 0) <= 0) break;

            let bestMove = null;
            for (let i = 0; i < staffIds.length; i++) {
                const sid = staffIds[i];
                if (forcedShiftByStaff[sid]) continue;
                const fromShift = assignment[sid];
                if (!fromShift || fromShift === shortageShift) continue;

                const sidTarget = Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
                if (sidTarget <= 0) continue;
                const fromCap = this.normalizeNumber(cap[fromShift], 0);
                const fromDemand = this.normalizeNumber(demandTotals[fromShift], 0);
                // 不把来源班别总容量拉穿
                if (fromCap - sidTarget < fromDemand) continue;

                const datesTo = positiveDemandDatesByShift[shortageShift] || [];
                const datesFrom = positiveDemandDatesByShift[fromShift] || [];
                let toAvail = 0;
                let fromAvail = 0;
                for (let d = 0; d < datesTo.length; d++) {
                    if (!this.isHardBlocked(sid, datesTo[d], requestState, nightMap)) toAvail += 1;
                }
                for (let d = 0; d < datesFrom.length; d++) {
                    if (!this.isHardBlocked(sid, datesFrom[d], requestState, nightMap)) fromAvail += 1;
                }
                const fitGain = toAvail - fromAvail;
                const gap = this.normalizeNumber(gapByShift[shortageShift], 0);
                const score =
                    Math.min(gap, sidTarget) * 100 +
                    fitGain * 4 +
                    this.normalizeNumber(availableCountByStaff[sid], 0) * 0.5 +
                    rng.random();
                if (!bestMove || score > bestMove.score) {
                    bestMove = { sid, fromShift, toShift: shortageShift, score };
                }
            }

            if (!bestMove) break;
            assignment[bestMove.sid] = bestMove.toShift;
        }

        const evaluateShortage = () => this.computeShiftCoverageShortage({
            assignment,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            staffIds
        });
        const findGap = (shortageObj, date, shift) => {
            if (!shortageObj || !Array.isArray(shortageObj.top)) return 0;
            const hit = shortageObj.top.find((r) => r.date === date && r.shift === shift);
            return hit ? this.normalizeNumber(hit.gap, 0) : 0;
        };

        let currentShortage = evaluateShortage();
        for (let step = 0; step < maxRepairSteps; step++) {
            if (currentShortage.total <= 0) {
                break;
            }

            const focusRows = (currentShortage.top || []).slice(0, 4);
            if (focusRows.length === 0) break;

            let bestAction = null;
            const tryPickBest = (action) => {
                if (!action || !action.nextShortage) return;
                if (!bestAction || action.score > bestAction.score) {
                    bestAction = action;
                }
            };

            for (let fIdx = 0; fIdx < focusRows.length; fIdx++) {
                const focus = focusRows[fIdx];
                const focusDate = focus.date;
                const focusShift = focus.shift;
                const focusGap = this.normalizeNumber(focus.gap, 0);
                if (focusGap <= 0) continue;

                const inFocusShift = staffIds.filter((sid) => assignment[sid] === focusShift);
                const blockedInFocus = inFocusShift.filter((sid) =>
                    !forcedShiftByStaff[sid] &&
                    this.isHardBlocked(sid, focusDate, requestState, nightMap)
                );
                const outsideAvailable = staffIds.filter((sid) =>
                    !forcedShiftByStaff[sid] &&
                    assignment[sid] !== focusShift &&
                    !this.isHardBlocked(sid, focusDate, requestState, nightMap)
                );

                // 动作1：直接换入（保持旧规则保护：不把来源班别在该日打穿）
                for (let i = 0; i < outsideAvailable.length; i++) {
                    const sid = outsideAvailable[i];
                    const fromShift = assignment[sid];
                    if (!fromShift || fromShift === focusShift) continue;

                    const oldNeed = this.normalizeNumber(dailyMinDemand[focusDate]?.[fromShift], 0);
                    const oldAvail = this.countAvailableByShiftOnDate({
                        assignment,
                        shift: fromShift,
                        date: focusDate,
                        requestState,
                        nightMap,
                        staffIds
                    });
                    if ((oldAvail - 1) < oldNeed) continue;

                    assignment[sid] = focusShift;
                    const nextShortage = evaluateShortage();
                    assignment[sid] = fromShift;

                    const improve = currentShortage.total - nextShortage.total;
                    const nextFocusGap = findGap(nextShortage, focusDate, focusShift);
                    const focusImprove = focusGap - nextFocusGap;
                    if (improve < 0) continue;
                    if (improve === 0 && focusImprove <= 0) continue;

                    const score =
                        improve * 10000 +
                        focusImprove * 500 +
                        this.normalizeNumber(targetDays[sid], 0) * 2 +
                        rng.random();
                    tryPickBest({
                        type: 'move',
                        sid,
                        from: fromShift,
                        to: focusShift,
                        nextShortage,
                        score
                    });
                }

                // 动作2：交换月班别（重点把“该日在缺班班别被阻塞的人”换出）
                for (let bIdx = 0; bIdx < blockedInFocus.length; bIdx++) {
                    const blockedSid = blockedInFocus[bIdx];
                    for (let i = 0; i < outsideAvailable.length; i++) {
                        const sid = outsideAvailable[i];
                        if (sid === blockedSid) continue;
                        const fromShift = assignment[sid];
                        if (!fromShift || fromShift === focusShift) continue;

                        assignment[blockedSid] = fromShift;
                        assignment[sid] = focusShift;
                        const nextShortage = evaluateShortage();
                        assignment[blockedSid] = focusShift;
                        assignment[sid] = fromShift;

                        const improve = currentShortage.total - nextShortage.total;
                        const nextFocusGap = findGap(nextShortage, focusDate, focusShift);
                        const focusImprove = focusGap - nextFocusGap;
                        if (improve < 0) continue;
                        if (improve === 0 && focusImprove <= 0) continue;

                        const score =
                            improve * 12000 +
                            focusImprove * 800 +
                            30 +
                            rng.random();
                        tryPickBest({
                            type: 'swap',
                            inSid: sid,
                            inFrom: fromShift,
                            blockedSid,
                            blockedFrom: focusShift,
                            nextShortage,
                            score
                        });
                    }
                }
            }

            if (!bestAction) break;
            if (bestAction.type === 'move') {
                if (forcedShiftByStaff[bestAction.sid]) break;
                assignment[bestAction.sid] = bestAction.to;
            } else if (bestAction.type === 'swap') {
                if (forcedShiftByStaff[bestAction.inSid] || forcedShiftByStaff[bestAction.blockedSid]) break;
                assignment[bestAction.inSid] = bestAction.blockedFrom;
                assignment[bestAction.blockedSid] = bestAction.inFrom;
            } else {
                break;
            }
            currentShortage = bestAction.nextShortage;
        }

        return assignment;
    },

    buildScheduleForMonthlyShift(ctx) {
        const {
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            monthlyShiftAssignments,
            relax,
            rng,
            maxSteps,
            config,
            trace = false,
            watchDates = [],
            traceLabel = ''
        } = ctx;

        const staffIds = staffList.map(s => s._sid);
        const scheduleByStaff = {};
        const assignedSet = {};
        const fixedWorkSet = {};
        const remaining = {};
        const extraUsed = {};
        const maxExtraDayPerStaff = Math.max(0, Math.floor(config?.maxExtraDayPerStaff ?? 0));
        const maxEmergencyExtraDayPerStaff = Math.max(0, Math.floor(config?.maxEmergencyExtraDayPerStaff ?? 0));
        const extraCapByStaff = this.buildExtraCapByStaff(staffList, targetDays, config);
        const extraFairnessProfile = this.buildExtraFairnessProfile(staffIds, targetDays, config);

        staffIds.forEach((sid) => {
            scheduleByStaff[sid] = {};
            assignedSet[sid] = new Set();
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
            remaining[sid] = targetDays[sid] || 0;
            extraUsed[sid] = 0;
        });

        const assignedCountByDateShift = {};
        dateList.forEach((date) => {
            assignedCountByDateShift[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                assignedCountByDateShift[date][shift] = 0;
            });
        });
        const watchDateSet = new Set(watchDates || []);

        let steps = 0;

        const dateOrder = dateList.map((date, idx) => {
            let risk = 0;
            this.SHIFT_TYPES.forEach((shift) => {
                const need = this.normalizeNumber(dailyMinDemand[date]?.[shift], 0);
                if (need <= 0) return;
                let avail = 0;
                staffIds.forEach((sid) => {
                    if (monthlyShiftAssignments[sid] !== shift) return;
                    if (this.isHardBlocked(sid, date, requestState, nightMap)) return;
                    avail += 1;
                });
                if (avail <= 0) {
                    risk += need * 100;
                    return;
                }
                const slack = avail - need;
                risk += (need / avail) * 50;
                if (slack < 2) {
                    risk += (2 - slack) * 20;
                }
            });
            // 同等风险时，优先靠后的日期，避免“前满后缺”
            risk += idx * 0.01;
            return { idx, risk };
        }).sort((a, b) => {
            if (b.risk !== a.risk) return b.risk - a.risk;
            return b.idx - a.idx;
        }).map((x) => x.idx);

        // 先满足每日每班最低人力（按稀缺日期优先）
        for (let ord = 0; ord < dateOrder.length; ord++) {
            const dIdx = dateOrder[ord];
            const date = dateList[dIdx];

            for (let sIdx = 0; sIdx < this.SHIFT_TYPES.length; sIdx++) {
                const shift = this.SHIFT_TYPES[sIdx];
                const need = dailyMinDemand[date]?.[shift] || 0;
                if (need <= 0) continue;

                while (assignedCountByDateShift[date][shift] < need) {
                    steps += 1;
                    if (steps > maxSteps) break;

                    let candidates = staffIds.filter((sid) => {
                        if (monthlyShiftAssignments[sid] !== shift) return false;
                        if (remaining[sid] <= 0 && extraUsed[sid] >= extraCapByStaff[sid]) return false;
                        if (assignedSet[sid].has(date)) return false;
                        if (this.isHardBlocked(sid, date, requestState, nightMap)) return false;
                        if (this.willBreakMaxWork(assignedSet[sid], dateList, dIdx, relax.maxWork, fixedWorkSet[sid])) return false;
                        return true;
                    });

                    let isEmergencyOverTarget = false;
                    if (candidates.length === 0 && config && config.allowEmergencyOverTarget === true) {
                        candidates = staffIds.filter((sid) => {
                            if (monthlyShiftAssignments[sid] !== shift) return false;
                            if (assignedSet[sid].has(date)) return false;
                            if (this.isHardBlocked(sid, date, requestState, nightMap)) return false;
                            if (this.willBreakMaxWork(assignedSet[sid], dateList, dIdx, relax.maxWork, fixedWorkSet[sid])) return false;
                            const actual = assignedSet[sid].size;
                            const target = this.normalizeNumber(targetDays[sid], 0);
                            const cap = this.normalizeNumber(extraCapByStaff[sid], 0);
                            const emergencyUpper = target + cap + maxEmergencyExtraDayPerStaff;
                            if (actual >= emergencyUpper) return false;
                            // 仅在已达目标+上限后作为应急补位
                            return remaining[sid] <= 0 && extraUsed[sid] >= extraCapByStaff[sid];
                        });
                        isEmergencyOverTarget = candidates.length > 0;
                    }

                    if (candidates.length === 0) break;

                    candidates.sort((a, b) => {
                        const pa = this.getWorkPressure(a, dIdx, dateList, requestState, nightMap, remaining);
                        const pb = this.getWorkPressure(b, dIdx, dateList, requestState, nightMap, remaining);
                        if (pb !== pa) return pb - pa;

                        const aa = this.normalizeNumber(assignedSet[a]?.size, 0);
                        const ab = this.normalizeNumber(assignedSet[b]?.size, 0);
                        const ta = this.normalizeNumber(targetDays[a], 0);
                        const tb = this.normalizeNumber(targetDays[b], 0);
                        const ea = this.getExtraCandidateBiasScore(a, aa, ta, extraFairnessProfile, config);
                        const eb = this.getExtraCandidateBiasScore(b, ab, tb, extraFairnessProfile, config);
                        if (eb !== ea) return eb - ea;

                        const ca = this.continuityScore(assignedSet[a], dateList, dIdx, relax, fixedWorkSet[a]);
                        const cb = this.continuityScore(assignedSet[b], dateList, dIdx, relax, fixedWorkSet[b]);
                        if (cb !== ca) return cb - ca;

                        return rng.random() - 0.5;
                    });

                    const pick = candidates[0];
                    assignedSet[pick].add(date);
                    scheduleByStaff[pick][date] = shift;
                    if (remaining[pick] > 0) {
                        remaining[pick] -= 1;
                    } else {
                        extraUsed[pick] += 1;
                        if (isEmergencyOverTarget) {
                            // 仅用于统计可读性：不额外做硬阻断，交给目标违约评估
                            extraUsed[pick] += 0;
                        }
                    }
                    assignedCountByDateShift[date][shift] += 1;
                }
            }

            if (trace && watchDateSet.has(date)) {
                this.logDateCoverageTrace({
                    stage: '最低人力填充',
                    traceLabel,
                    date,
                    countByShift: assignedCountByDateShift[date],
                    needByShift: dailyMinDemand[date] || {}
                });
            }
        }

        // 再补齐个人白班目标天数
        const stuck = {};
        for (let loop = 0; loop < maxSteps; loop++) {
            const under = staffIds.filter((sid) => remaining[sid] > 0 && !stuck[sid]);
            if (under.length === 0) break;

            under.sort((a, b) => remaining[b] - remaining[a]);
            const sid = under[0];
            const shift = monthlyShiftAssignments[sid];

            let bestDate = null;
            let bestScore = -Infinity;

            for (let dIdx = 0; dIdx < dateList.length; dIdx++) {
                const date = dateList[dIdx];
                if (assignedSet[sid].has(date)) continue;
                if (this.isHardBlocked(sid, date, requestState, nightMap)) continue;
                if (this.willBreakMaxWork(assignedSet[sid], dateList, dIdx, relax.maxWork, fixedWorkSet[sid])) continue;

                const score = this.continuityScore(assignedSet[sid], dateList, dIdx, relax, fixedWorkSet[sid])
                    + this.restBreakScore(assignedSet[sid], dateList, dIdx, relax.maxRest, fixedWorkSet[sid])
                    + (dailyMinDemand[date]?.[shift] || 0)
                    + rng.random();

                if (score > bestScore) {
                    bestScore = score;
                    bestDate = date;
                }
            }

            if (!bestDate) {
                stuck[sid] = true; // 当前约束下无法再补，留给违约评估
                continue;
            }

            assignedSet[sid].add(bestDate);
            scheduleByStaff[sid][bestDate] = shift;
            remaining[sid] -= 1;
            assignedCountByDateShift[bestDate][shift] += 1;

            if (trace && watchDateSet.has(bestDate)) {
                console.log(
                    `[CSPSolverV2][Trace:${traceLabel}] 目标补齐 -> 员工${sid} 日期${bestDate} 班别${shift} 剩余目标${remaining[sid]}`
                );
                this.logDateCoverageTrace({
                    stage: '目标补齐',
                    traceLabel,
                    date: bestDate,
                    countByShift: assignedCountByDateShift[bestDate],
                    needByShift: dailyMinDemand[bestDate] || {}
                });
            }
        }

        // 若有人超额，尝试安全回收（不打破最低人力）
        const over = staffIds.filter((sid) => remaining[sid] < 0);
        over.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            const dates = Array.from(assignedSet[sid]);
            dates.sort(() => rng.random() - 0.5);

            for (let i = 0; i < dates.length && remaining[sid] < 0; i++) {
                const date = dates[i];
                const need = dailyMinDemand[date]?.[shift] || 0;
                if (assignedCountByDateShift[date][shift] <= need) continue;

                assignedSet[sid].delete(date);
                delete scheduleByStaff[sid][date];
                assignedCountByDateShift[date][shift] -= 1;
                remaining[sid] += 1;

                if (trace && watchDateSet.has(date)) {
                    console.log(
                        `[CSPSolverV2][Trace:${traceLabel}] 超额回收 -> 员工${sid} 日期${date} 班别${shift}`
                    );
                    this.logDateCoverageTrace({
                        stage: '超额回收',
                        traceLabel,
                        date,
                        countByShift: assignedCountByDateShift[date],
                        needByShift: dailyMinDemand[date] || {}
                    });
                }
            }
        });

        const welfareRepair = this.repairLongRestByExtraDays({
            staffIds,
            dateList,
            scheduleByStaff,
            assignedSet,
            fixedWorkSet,
            monthlyShiftAssignments,
            requestState,
            nightMap,
            dailyMinDemand,
            assignedCountByDateShift,
            remaining,
            extraUsed,
            extraCapByStaff,
            relax,
            rng
        });

        if (trace && welfareRepair && welfareRepair.addedCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 福利修复完成: addDays=${welfareRepair.addedCount}, residualRestOver=${welfareRepair.residualRestOver}`
            );
        }

        const continuityRepair = this.repairContinuityBySwaps({
            staffIds,
            dateList,
            scheduleByStaff,
            assignedSet,
            fixedWorkSet,
            monthlyShiftAssignments,
            requestState,
            nightMap,
            relax,
            rng,
            maxSwapSteps: Math.max(150, Math.floor(maxSteps / 12)),
            trace,
            watchDateSet,
            traceLabel
        });

        if (trace && continuityRepair && continuityRepair.swapCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 连续性修复完成: swaps=${continuityRepair.swapCount}, residualOver=${continuityRepair.residualOver}`
            );
        }

        const shortageRepair = this.repairDailyShortageByShiftAddsAndMoves({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            extraCapByStaff,
            config,
            allowEmergencyOverTarget: config?.allowEmergencyOverTarget === true,
            maxEmergencyExtraDayPerStaff,
            maxRepairSteps: Math.max(160, Math.floor(maxSteps / 10))
        });

        if (trace && shortageRepair && (shortageRepair.addCount > 0 || shortageRepair.moveCount > 0)) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 缺班定向修复完成: add=${shortageRepair.addCount}, move=${shortageRepair.moveCount}, shortageReduced=${shortageRepair.shortageReduced}`
            );
        }

        const fairnessRepair = this.repairStaffWorkdayFairnessByShiftTransfers({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            maxTransferSteps: Math.max(120, Math.floor(maxSteps / 15))
        });

        if (trace && fairnessRepair && fairnessRepair.transferCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 人天公平修复完成: transfers=${fairnessRepair.transferCount}, fairnessGain=${fairnessRepair.fairnessGain}`
            );
        }

        const continuousRestSoftGoalEnabled = config?.continuousRestSoftGoalEnabled !== false;
        const preferredRestRepair = continuousRestSoftGoalEnabled
            ? this.repairPreferredLongestRestByMoves({
                staffIds,
                dateList,
                scheduleByStaff,
                assignedSet,
                fixedWorkSet,
                monthlyShiftAssignments,
                requestState,
                nightMap,
                dailyMinDemand,
                assignedCountByDateShift,
                relax,
                rng,
                preferredLongestRestDays: Math.max(
                    1,
                    Math.floor(this.normalizeNumber(config?.preferredLongestRestDays, this.normalizeNumber(config?.preferredMinRestDays, 4)))
                ),
                maxRepairSteps: Math.max(80, Math.floor(maxSteps / 20))
            })
            : { moveCount: 0, improvedStaffCount: 0, disabledByConfig: true };

        if (trace && preferredRestRepair && preferredRestRepair.moveCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 连休偏好修复完成: moves=${preferredRestRepair.moveCount}, improvedStaff=${preferredRestRepair.improvedStaffCount}`
            );
        }

        const hardTargetRepair = this.repairHardTargetMismatch({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            extraCapByStaff,
            config,
            maxRepairSteps: Math.max(60, Math.min(280, Math.floor(maxSteps / 16)))
        });

        if (trace && hardTargetRepair && hardTargetRepair.hardGain > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 目标硬约束修复完成: transfer=${hardTargetRepair.transferCount}, add=${hardTargetRepair.addCount}, drop=${hardTargetRepair.dropCount}, hardGain=${hardTargetRepair.hardGain}, residualTargetMismatch=${hardTargetRepair.residualTargetMismatch}`
            );
        }

        const targetFloorRepair = this.enforceTargetFloorByGreedyAdds({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            maxAddSteps: Math.max(80, Math.min(240, Math.floor(maxSteps / 8)))
        });

        if (trace && targetFloorRepair && targetFloorRepair.addedCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 下限补齐完成: add=${targetFloorRepair.addedCount}, cleared=${targetFloorRepair.clearedCount}, unresolved=${targetFloorRepair.unresolvedCount}`
            );
        }

        const underTargetTransferRepair = this.repairUnderTargetByShiftTransfers({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            relax,
            rng,
            config,
            maxTransferSteps: Math.max(90, Math.min(300, Math.floor(maxSteps / 12)))
        });

        if (trace && underTargetTransferRepair && underTargetTransferRepair.transferCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 欠配优先补齐完成: transfer=${underTargetTransferRepair.transferCount}, underGain=${underTargetTransferRepair.underGain}, residualUnder=${underTargetTransferRepair.residualUnderTarget}`
            );
        }

        const overflowTransferRepair = this.repairOverflowByShiftTransfers({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            extraCapByStaff,
            requestState,
            nightMap,
            relax,
            rng,
            config,
            maxTransferSteps: Math.max(120, Math.min(420, Math.floor(maxSteps / 6)))
        });

        if (trace && overflowTransferRepair && overflowTransferRepair.transferCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 过量分担修复完成: transfer=${overflowTransferRepair.transferCount}, overflowGain=${overflowTransferRepair.overflowGain}`
            );
        }

        const overflowDropRepair = this.repairTargetOverflowBySafeDrops({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            extraCapByStaff,
            dailyMinDemand,
            requestState,
            nightMap,
            relax,
            rng,
            config,
            maxDropSteps: Math.max(120, Math.min(420, Math.floor(maxSteps / 6)))
        });

        if (trace && overflowDropRepair && overflowDropRepair.dropCount > 0) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 过量回收修复完成: drop=${overflowDropRepair.dropCount}, overflowGain=${overflowDropRepair.overflowGain}, residualOverflow=${overflowDropRepair.residualOverflow}`
            );
        }

        const finalShortageRepair = this.repairDailyShortageByShiftAddsAndMoves({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            extraCapByStaff,
            config,
            allowEmergencyOverTarget: true,
            maxEmergencyExtraDayPerStaff,
            allowBreakMaxWorkOnEmergency: true,
            maxRepairSteps: Math.max(220, Math.floor(maxSteps / 6))
        });

        if (trace && finalShortageRepair && (finalShortageRepair.addCount > 0 || finalShortageRepair.moveCount > 0)) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 末轮缺班强修复完成: add=${finalShortageRepair.addCount}, move=${finalShortageRepair.moveCount}, shortageReduced=${finalShortageRepair.shortageReduced}`
            );
        }

        const postFinalOverflowTransferRepair = this.repairOverflowByShiftTransfers({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            extraCapByStaff,
            requestState,
            nightMap,
            relax,
            rng,
            config,
            maxTransferSteps: Math.max(140, Math.min(520, Math.floor(maxSteps / 5)))
        });

        const postFinalOverflowDropRepair = this.repairTargetOverflowBySafeDrops({
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            extraCapByStaff,
            dailyMinDemand,
            requestState,
            nightMap,
            relax,
            rng,
            config,
            maxDropSteps: Math.max(140, Math.min(520, Math.floor(maxSteps / 5)))
        });

        if (trace && (
            (postFinalOverflowTransferRepair && postFinalOverflowTransferRepair.transferCount > 0)
            || (postFinalOverflowDropRepair && postFinalOverflowDropRepair.dropCount > 0)
        )) {
            console.log(
                `[CSPSolverV2][Trace:${traceLabel}] 末轮过量回收完成: transfer=${Number(postFinalOverflowTransferRepair?.transferCount || 0)}, drop=${Number(postFinalOverflowDropRepair?.dropCount || 0)}`
            );
        }

        const hardShortageBeforeRescue = this.computeDailyShortageSummary(
            scheduleByStaff,
            dateList,
            dailyMinDemand,
            monthlyShiftAssignments
        );
        let hardShortageRescue = {
            rounds: 0,
            addCount: 0,
            moveCount: 0,
            shortageBefore: Number(hardShortageBeforeRescue.total || 0),
            shortageAfter: Number(hardShortageBeforeRescue.total || 0)
        };
        if (hardShortageBeforeRescue.total > 0) {
            const rescueRounds = Math.max(1, Math.min(3, Math.floor(this.normalizeNumber(config?.hardShortageRescueRounds, 2))));
            const rescueBaseSteps = Math.max(280, Math.floor(maxSteps / 4));
            const baseEmergency = Math.max(
                maxEmergencyExtraDayPerStaff,
                Math.min(4, Math.ceil(hardShortageBeforeRescue.total / Math.max(1, Math.floor(staffIds.length / 2))))
            );
            const relaxedExtraCapByStaff = {};
            staffIds.forEach((sid) => {
                const baseCap = Math.max(0, Math.floor(this.normalizeNumber(extraCapByStaff[sid], 0)));
                relaxedExtraCapByStaff[sid] = Math.max(baseCap, Math.max(1, maxExtraDayPerStaff));
            });

            for (let round = 0; round < rescueRounds; round++) {
                const rescueRun = this.repairDailyShortageByShiftAddsAndMoves({
                    staffIds,
                    dateList,
                    scheduleByStaff,
                    monthlyShiftAssignments,
                    targetDays,
                    requestState,
                    nightMap,
                    dailyMinDemand,
                    relax,
                    rng,
                    extraCapByStaff: relaxedExtraCapByStaff,
                    config: {
                        ...(config || {}),
                        // 硬约束兜底阶段：临时关闭公平偏置，优先补齐缺班
                        extraByTargetAvgBiasEnabled: false
                    },
                    allowEmergencyOverTarget: true,
                    maxEmergencyExtraDayPerStaff: baseEmergency + round,
                    allowBreakMaxWorkOnEmergency: true,
                    maxRepairSteps: rescueBaseSteps + round * 120
                });

                hardShortageRescue.rounds += 1;
                hardShortageRescue.addCount += Number(rescueRun?.addCount || 0);
                hardShortageRescue.moveCount += Number(rescueRun?.moveCount || 0);

                const now = this.computeDailyShortageSummary(
                    scheduleByStaff,
                    dateList,
                    dailyMinDemand,
                    monthlyShiftAssignments
                );
                hardShortageRescue.shortageAfter = Number(now.total || 0);

                if (trace) {
                    console.log(
                        `[CSPSolverV2][Trace:${traceLabel}] 硬约束兜底补缺 round=${round + 1}/${rescueRounds}, add=${Number(rescueRun?.addCount || 0)}, move=${Number(rescueRun?.moveCount || 0)}, shortageNow=${now.total}`
                    );
                }
                if (now.total <= 0) break;

                if ((Number(rescueRun?.addCount || 0) + Number(rescueRun?.moveCount || 0)) <= 0) {
                    break;
                }

                // 下一轮适度放宽额外cap，扩张可行空间
                staffIds.forEach((sid) => {
                    relaxedExtraCapByStaff[sid] = Math.max(relaxedExtraCapByStaff[sid], Math.max(1, maxExtraDayPerStaff) + round + 1);
                });
            }

            if (hardShortageRescue.shortageAfter > 0) {
                const postRescueOverflowTransferRepair = this.repairOverflowByShiftTransfers({
                    staffIds,
                    dateList,
                    scheduleByStaff,
                    monthlyShiftAssignments,
                    targetDays,
                    extraCapByStaff,
                    requestState,
                    nightMap,
                    relax,
                    rng,
                    config,
                    maxTransferSteps: Math.max(120, Math.min(420, Math.floor(maxSteps / 6)))
                });
                const postRescueOverflowDropRepair = this.repairTargetOverflowBySafeDrops({
                    staffIds,
                    dateList,
                    scheduleByStaff,
                    monthlyShiftAssignments,
                    targetDays,
                    extraCapByStaff,
                    dailyMinDemand,
                    requestState,
                    nightMap,
                    relax,
                    rng,
                    config,
                    maxDropSteps: Math.max(120, Math.min(420, Math.floor(maxSteps / 6)))
                });
                if (trace && (
                    Number(postRescueOverflowTransferRepair?.transferCount || 0) > 0
                    || Number(postRescueOverflowDropRepair?.dropCount || 0) > 0
                )) {
                    console.log(
                        `[CSPSolverV2][Trace:${traceLabel}] 兜底后过量回收: transfer=${Number(postRescueOverflowTransferRepair?.transferCount || 0)}, drop=${Number(postRescueOverflowDropRepair?.dropCount || 0)}`
                    );
                }
            }
        }

        const evaluation = this.evaluateSchedule({
            scheduleByStaff,
            dateList,
            dailyMinDemand,
            monthlyShiftAssignments,
            targetDays,
            relax,
            nightMap,
            maxExtraDayPerStaff,
            extraCapByStaff,
            preferredMinWorkDays: Math.max(1, Math.floor(this.normalizeNumber(config?.preferredMinWorkDays, 4))),
            preferredMinRestDays: Math.max(1, Math.floor(this.normalizeNumber(config?.preferredMinRestDays, 4))),
            preferredLongestRestDays: Math.max(
                1,
                Math.floor(this.normalizeNumber(config?.preferredLongestRestDays, this.normalizeNumber(config?.preferredMinRestDays, 4)))
            ),
            continuousRestSoftGoalEnabled
        });

        const extraDayUsage = {};
        let extraDayTotal = 0;
        staffIds.forEach((sid) => {
            if (extraUsed[sid] > 0) {
                extraDayUsage[sid] = extraUsed[sid];
                extraDayTotal += extraUsed[sid];
            }
        });

        return {
            ...evaluation,
            scheduleByStaff,
            monthlyShiftAssignments,
            shiftDistribution: this.countShiftDistribution(monthlyShiftAssignments),
            extraDayUsage,
            extraDayTotal,
            hardShortageRescue,
            score: evaluation.score,
            totalAssignments: evaluation.totalAssignments
        };
    },

    evaluateSchedule(ctx) {
        const {
            scheduleByStaff,
            dateList,
            dailyMinDemand,
            monthlyShiftAssignments,
            targetDays,
            relax,
            nightMap,
            maxExtraDayPerStaff = 0,
            extraCapByStaff = {},
            preferredMinWorkDays = 4,
            preferredMinRestDays = 4,
            preferredLongestRestDays = 4,
            continuousRestSoftGoalEnabled = true
        } = ctx;

        const hardViolations = {
            dailyShortage: 0,
            targetMismatch: 0,
            targetOverflow: 0,
            // 连续上下班违例保留统计，但按软约束处理
            maxWorkViolation: 0,
            maxRestViolation: 0,
            total: 0,
            shortageByDate: {}
        };

        let softPenalty = 0;

        // 统计每天每班人数
        const dailyShiftCount = {};
        dateList.forEach((date) => {
            dailyShiftCount[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                dailyShiftCount[date][shift] = 0;
            });
        });

        Object.entries(scheduleByStaff).forEach(([sid, dates]) => {
            Object.entries(dates).forEach(([date, shift]) => {
                if (dailyShiftCount[date] && dailyShiftCount[date][shift] != null) {
                    dailyShiftCount[date][shift] += 1;
                }
            });
        });

        dateList.forEach((date) => {
            const dateShort = {};
            this.SHIFT_TYPES.forEach((shift) => {
                const need = dailyMinDemand[date]?.[shift] || 0;
                const actual = dailyShiftCount[date][shift] || 0;
                if (actual < need) {
                    const gap = need - actual;
                    hardViolations.dailyShortage += gap;
                    dateShort[shift] = gap;
                }
            });
            if (Object.keys(dateShort).length > 0) {
                hardViolations.shortageByDate[date] = dateShort;
            }
        });

        // 每人目标天数与连续性
        let targetMismatchTotal = 0;
        let totalAssignments = 0;

        Object.entries(scheduleByStaff).forEach(([sid, dates]) => {
            const assignedDays = Object.keys(dates).length;
            const target = targetDays[sid] || 0;
            const staffExtraCap = Number.isFinite(Number(extraCapByStaff[sid]))
                ? Math.max(0, Math.floor(Number(extraCapByStaff[sid])))
                : Math.max(0, Math.floor(Number(maxExtraDayPerStaff) || 0));
            const lowerGap = Math.max(0, target - assignedDays);
            const upperGap = Math.max(0, assignedDays - (target + staffExtraCap));
            const hardGap = lowerGap;

            if (hardGap > 0) {
                hardViolations.targetMismatch += hardGap;
                targetMismatchTotal += hardGap;
            }
            if (upperGap > 0) {
                hardViolations.targetOverflow += upperGap;
            }

            // 超出目标按软约束惩罚：超出可允许上限(upperGap)时采用更高惩罚，抑制人员过载
            const softOver = Math.max(0, assignedDays - target);
            const softOverWithinCap = Math.min(softOver, staffExtraCap);
            softPenalty += softOverWithinCap * 20;
            if (upperGap > 0) {
                softPenalty += upperGap * 420 + upperGap * upperGap * 60;
            }
            totalAssignments += assignedDays;

            const runs = this.extractRuns(dates, dateList, new Set(Object.keys(nightMap[sid] || {})));
            const softPreferredWorkMin = Math.max(relax.minWork, preferredMinWorkDays);
            const softPreferredRestMin = Math.max(relax.minRest, preferredMinRestDays);
            const softPreferredLongestRest = Math.max(1, this.normalizeNumber(preferredLongestRestDays, preferredMinRestDays));
            runs.workRuns.forEach((len) => {
                if (len > relax.maxWork) {
                    hardViolations.maxWorkViolation += (len - relax.maxWork);
                    softPenalty += (len - relax.maxWork) * 40;
                }
                if (len < relax.minWork) {
                    softPenalty += (relax.minWork - len) * 4;
                }
                // 软偏好：尽量形成 >=4 天工作段（不影响硬约束）
                if (len < softPreferredWorkMin) {
                    const welfareGap = softPreferredWorkMin - Math.max(len, relax.minWork);
                    if (welfareGap > 0) {
                        softPenalty += welfareGap * 8;
                    }
                }
            });
            const maxWorkRun = runs.workRuns.length > 0 ? Math.max(...runs.workRuns) : 0;
            if (maxWorkRun < softPreferredWorkMin) {
                softPenalty += (softPreferredWorkMin - maxWorkRun) * 14;
            }
            runs.restRuns.forEach((len) => {
                if (len > relax.maxRest) {
                    hardViolations.maxRestViolation += (len - relax.maxRest);
                    softPenalty += (len - relax.maxRest) * 35;
                }
                if (len < relax.minRest) {
                    softPenalty += (relax.minRest - len) * 3;
                }
                // 软偏好：尽量形成 >=preferredMinRestDays 天休息段（不影响硬约束）
                if (len < softPreferredRestMin) {
                    const welfareGap = softPreferredRestMin - Math.max(len, relax.minRest);
                    if (welfareGap > 0) {
                        softPenalty += welfareGap * 6;
                    }
                }
            });
            // 软偏好：至少出现一次较完整的休息段（默认 >=4），降低“全月碎休”。
            const maxRestRun = runs.restRuns.length > 0 ? Math.max(...runs.restRuns) : 0;
            if (continuousRestSoftGoalEnabled !== false && maxRestRun < softPreferredLongestRest) {
                softPenalty += (softPreferredLongestRest - maxRestRun) * 28;
            }

            // 段数越多，越碎
            softPenalty += Math.max(0, runs.workRuns.length - 1) * 2;
            softPenalty += Math.max(0, runs.restRuns.length - 1) * 2;
        });

        hardViolations.total =
            hardViolations.dailyShortage +
            hardViolations.targetMismatch;

        const score =
            hardViolations.dailyShortage * 1300000 +
            hardViolations.targetMismatch * 1000000 +
            hardViolations.maxWorkViolation * 400 +
            hardViolations.maxRestViolation * 400 +
            softPenalty;

        return {
            hardViolations,
            targetMismatchTotal,
            softPenalty,
            score,
            totalAssignments
        };
    },

    assignFunctions(ctx) {
        const {
            scheduleByStaff,
            dateList,
            staffList,
            functionBalanceM,
            shiftBalanceSixTotalTolerance = 1,
            globalDailyFunctionBaseline,
            dailyFunctionMinThreshold = 6,
            dailyFunctionMinima = {},
            functionAllocationMode = 'monthly',
            functionBaselineScope = 'global',
            majorFunctionPersonalRatioEnabled = true
        } = ctx;

        const warnings = [];

        const allAssignments = [];
        Object.entries(scheduleByStaff).forEach(([sid, dates]) => {
            Object.entries(dates).forEach(([date, shift]) => {
                allAssignments.push({ sid, date, shift });
            });
        });

        const actualTotalAssignments = allAssignments.length;
        const baselineTotal = Object.values(globalDailyFunctionBaseline).reduce((sum, n) => sum + n, 0);
        const baselineScope = String(functionBaselineScope || '').toLowerCase();
        const baselineLooksShanghai = baselineTotal > 0 && baselineTotal <= 15;
        const useShanghaiBaseline = baselineScope === 'shanghai' || baselineLooksShanghai;
        const shanghaiPerDayTarget = baselineTotal > 0
            ? (useShanghaiBaseline ? baselineTotal : (baselineTotal / 3))
            : 0;
        const shanghaiFunctionThirdTarget = Math.round(shanghaiPerDayTarget * dateList.length);
        const baselineTargetLabel = useShanghaiBaseline ? '基线目标人次' : '1/3目标人次';

        const targetGapAbs = Math.abs(actualTotalAssignments - shanghaiFunctionThirdTarget);
        // 大样本(月度总人次较高)下按固定“天数阈值”会产生大量误告警，这里采用相对阈值兜底。
        const targetWarnThreshold = Math.max(
            2,
            Math.floor(dateList.length * 0.25),
            Math.floor(shanghaiFunctionThirdTarget * 0.12)
        );
        if (targetGapAbs > targetWarnThreshold) {
            warnings.push(`白班总人次(${actualTotalAssignments})与${baselineTargetLabel}(${shanghaiFunctionThirdTarget})偏差较大，按实际人次分配职能`);
        }

        const functionTargets = this.buildFunctionTargets(
            actualTotalAssignments,
            globalDailyFunctionBaseline
        );
        const staffAssignmentCount = {};

        const rng = this.createSeededRandom(20260214);
        const staffFunctionCounts = {};
        const staffFunctionTargets = {};
        const staffRecentFunctionState = {};
        const monthlyAssigned = {};
        const dailyAssignmentCount = {};
        const dailyFunctionTargets = {};
        const dailyFunctionStats = {};
        const functionScheduleByStaff = {};

        staffList.forEach((s) => {
            staffAssignmentCount[s._sid] = 0;
            staffFunctionCounts[s._sid] = {};
            this.FUNCTION_TYPES.forEach((f) => {
                staffFunctionCounts[s._sid][f] = 0;
            });
            staffRecentFunctionState[s._sid] = { lastFunction: '', streak: 0 };
        });
        this.FUNCTION_TYPES.forEach((f) => {
            monthlyAssigned[f] = 0;
        });
        dateList.forEach((d) => {
            dailyFunctionStats[d] = {};
            dailyAssignmentCount[d] = 0;
            this.FUNCTION_TYPES.forEach((f) => {
                dailyFunctionStats[d][f] = 0;
            });
        });

        allAssignments.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.sid !== b.sid) return String(a.sid).localeCompare(String(b.sid));
            return 0;
        });

        allAssignments.forEach((slot) => {
            dailyAssignmentCount[slot.date] = (dailyAssignmentCount[slot.date] || 0) + 1;
            staffAssignmentCount[slot.sid] = this.normalizeNumber(staffAssignmentCount[slot.sid], 0) + 1;
        });
        const byDateTargets = this.buildDailyFunctionTargets(
            dailyAssignmentCount,
            globalDailyFunctionBaseline,
            dailyFunctionMinima,
            dailyFunctionMinThreshold
        );
        dateList.forEach((d) => {
            dailyFunctionTargets[d] = byDateTargets[d] || {};
        });
        Object.assign(
            staffFunctionTargets,
            this.buildStaffFunctionTargets(staffAssignmentCount, functionTargets, rng, {
                majorFunctionPersonalRatioEnabled: majorFunctionPersonalRatioEnabled !== false
            })
        );

        const slotsByDate = {};
        allAssignments.forEach((slot) => {
            if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
            slotsByDate[slot.date].push(slot);
        });

        dateList.forEach((date) => {
            const daySlots = slotsByDate[date] || [];
            if (daySlots.length === 0) return;

            const dateQuota = { ...(dailyFunctionTargets[date] || {}) };
            daySlots.sort((a, b) => String(a.sid).localeCompare(String(b.sid)));

            daySlots.forEach((slot) => {
                const sid = slot.sid;
                const positiveQuotaFns = this.FUNCTION_TYPES.filter((f) => this.normalizeNumber(dateQuota[f], 0) > 0);
                const preferredFns = positiveQuotaFns.length > 0
                    ? positiveQuotaFns
                    : this.FUNCTION_TYPES;
                const chosen = this.pickFunctionForSlot({
                    sid,
                    date: slot.date,
                    staffFunctionCounts,
                    monthlyAssigned,
                    dailyFunctionStats,
                    dailyFunctionTargets,
                    functionTargets,
                    staffFunctionTargets,
                    staffRecentFunctionState,
                    staffAssignmentCount,
                    functionBalanceM,
                    rng,
                    dateQuota,
                    functionAllocationMode,
                    candidateFunctions: preferredFns,
                    majorFunctionPersonalRatioEnabled: majorFunctionPersonalRatioEnabled !== false
                });

                slot.function = chosen;
                staffFunctionCounts[sid][chosen] += 1;
                monthlyAssigned[chosen] += 1;
                dailyFunctionStats[slot.date][chosen] += 1;
                const recentState = staffRecentFunctionState[sid] || { lastFunction: '', streak: 0 };
                if (recentState.lastFunction === chosen) {
                    recentState.streak = this.normalizeNumber(recentState.streak, 0) + 1;
                } else {
                    recentState.lastFunction = chosen;
                    recentState.streak = 1;
                }
                staffRecentFunctionState[sid] = recentState;
                if (this.normalizeNumber(dateQuota[chosen], 0) > 0) {
                    dateQuota[chosen] -= 1;
                }
            });
        });

        // 后处理：优先修复每人六类职能差异，尽量满足 max-min <= m
        this.rebalanceStaffFunctions({
            allAssignments,
            staffFunctionCounts,
            monthlyAssigned,
            dailyFunctionStats,
            dailyFunctionTargets,
            functionTargets,
            staffFunctionTargets,
            staffAssignmentCount,
            functionBalanceM,
            rng,
            candidateFunctions: (majorFunctionPersonalRatioEnabled !== false)
                ? this.FUNCTION_TYPES
                : this.BALANCE_FUNCTIONS
        });

        // 后处理：网/天/微三类尽量均衡（人员级）
        if (majorFunctionPersonalRatioEnabled !== false) {
            this.rebalanceStaffMajorFunctions({
                allAssignments,
                staffFunctionCounts,
                monthlyAssigned,
                dailyFunctionStats,
                dailyFunctionTargets,
                functionTargets,
                staffFunctionTargets,
                staffAssignmentCount,
                rng
            });
        }

        // 后处理：同班别内六类职能总量在人员间尽量接近（软约束）
        const shiftBalanceRepair = this.rebalanceShiftStaffBalanceFunctionTotals({
            allAssignments,
            staffFunctionCounts,
            staffFunctionTargets,
            staffAssignmentCount,
            functionBalanceM,
            shiftBalanceSixTotalTolerance,
            majorFunctionPersonalRatioEnabled: majorFunctionPersonalRatioEnabled !== false,
            rng,
            maxIterations: 2200
        });

        // 同班别人天总量修复后，再次拉齐网/天/微比例，避免反向扰动。
        if (majorFunctionPersonalRatioEnabled !== false && shiftBalanceRepair.swapCount > 0) {
            this.rebalanceStaffMajorFunctions({
                allAssignments,
                staffFunctionCounts,
                monthlyAssigned,
                dailyFunctionStats,
                dailyFunctionTargets,
                functionTargets,
                staffFunctionTargets,
                staffAssignmentCount,
                rng,
                maxIterations: 1200
            });
        }
        // 同班别六类均衡修复可能改变“网天微总量”结构，补一轮“同班别同日互换”拉齐个人比例目标。
        const majorShiftRepair = (majorFunctionPersonalRatioEnabled !== false)
            ? this.rebalanceMajorRatioByShiftSwaps({
                allAssignments,
                staffFunctionCounts,
                staffFunctionTargets,
                staffAssignmentCount,
                functionBalanceM,
                shiftBalanceSixTotalTolerance,
                rng,
                maxIterations: 2600
            })
            : { swapCount: 0, majorGapGain: 0 };
        if (majorFunctionPersonalRatioEnabled !== false && majorShiftRepair.swapCount > 0) {
            this.rebalanceStaffMajorFunctions({
                allAssignments,
                staffFunctionCounts,
                monthlyAssigned,
                dailyFunctionStats,
                dailyFunctionTargets,
                functionTargets,
                staffFunctionTargets,
                staffAssignmentCount,
                rng,
                maxIterations: 900
            });
        }
        const majorMixRepair = (majorFunctionPersonalRatioEnabled !== false)
            ? this.rebalanceMajorFunctionMixByShiftSwaps({
                allAssignments,
                staffFunctionCounts,
                staffFunctionTargets,
                staffAssignmentCount,
                rng,
                maxIterations: 2200
            })
            : { swapCount: 0, majorL1Gain: 0 };

        // 基于最终分配重算 dailyFunctionStats
        dateList.forEach((d) => {
            this.FUNCTION_TYPES.forEach((f) => {
                dailyFunctionStats[d][f] = 0;
            });
        });
        allAssignments.forEach((slot) => {
            if (slot.function) {
                dailyFunctionStats[slot.date][slot.function] += 1;
            }
        });

        dateList.forEach((date) => {
            const total = Object.values(dailyFunctionStats[date] || {}).reduce((sum, n) => sum + this.normalizeNumber(n, 0), 0);
            if (total <= 0) return;
            let maxFn = null;
            let maxVal = -1;
            this.FUNCTION_TYPES.forEach((f) => {
                const v = this.normalizeNumber(dailyFunctionStats[date][f], 0);
                if (v > maxVal) {
                    maxVal = v;
                    maxFn = f;
                }
            });
            if (maxVal / total >= 0.7) {
                warnings.push(`${date} 职能集中度偏高: ${maxFn}=${maxVal}/${total}`);
            }
        });

        allAssignments.forEach((slot) => {
            if (!slot.function) return;
            if (!functionScheduleByStaff[slot.sid]) {
                functionScheduleByStaff[slot.sid] = {};
            }
            functionScheduleByStaff[slot.sid][slot.date] = slot.function;
        });

        // 软约束：六类职能 max-min <= m
        Object.entries(staffFunctionCounts).forEach(([sid, cnt]) => {
            const vals = this.BALANCE_FUNCTIONS.map(f => cnt[f] || 0);
            const max = Math.max(...vals);
            const min = Math.min(...vals);
            const balanceLimit = this.getStaffFunctionBalanceLimit(
                staffAssignmentCount[sid],
                functionBalanceM
            );
            if (max - min > balanceLimit) {
                warnings.push(`员工${sid}六类职能差异超阈值: ${max - min} > ${balanceLimit}`);
            }
            if (majorFunctionPersonalRatioEnabled !== false) {
                const majorVals = this.MAJOR_FUNCTIONS.map((f) => cnt[f] || 0);
                const majorMax = Math.max(...majorVals);
                const majorMin = Math.min(...majorVals);
                const majorLimit = this.getStaffMajorFunctionBalanceLimit(staffAssignmentCount[sid]);
                if (majorMax - majorMin > majorLimit) {
                    warnings.push(`员工${sid}网天微差异超阈值: ${majorMax - majorMin} > ${majorLimit}`);
                }
                const majorTargetDeviation = this.MAJOR_FUNCTIONS.reduce((sum, f) => {
                    return sum + Math.abs(
                        this.normalizeNumber(cnt[f], 0) - this.normalizeNumber(staffFunctionTargets?.[sid]?.[f], 0)
                    );
                }, 0);
                const majorTargetTolerance = Math.max(1, Math.floor(this.normalizeNumber(staffAssignmentCount[sid], 0) / 8));
                if (majorTargetDeviation > majorTargetTolerance) {
                    warnings.push(`员工${sid}网天微与目标比例偏差较大: ${majorTargetDeviation} > ${majorTargetTolerance}`);
                }
            }
        });

        const shiftBalanceStats = this.collectShiftStaffBalanceFunctionTotalStats({
            staffFunctionCounts,
            staffAssignmentCount,
            allAssignments,
            shiftBalanceSixTotalTolerance
        });
        if (shiftBalanceRepair.swapCount > 0) {
            warnings.push(
                `同班别六类职能总量均衡修复已执行 ${shiftBalanceRepair.swapCount} 次（剩余超差 ${shiftBalanceStats.violationTotal}）`
            );
        }
        if (majorShiftRepair.swapCount > 0) {
            warnings.push(`网天微比例同班别互换修复已执行 ${majorShiftRepair.swapCount} 次（偏差改善 ${majorShiftRepair.majorGapGain}）`);
        }
        if (majorMixRepair.swapCount > 0) {
            warnings.push(`网天微同班别细化互换已执行 ${majorMixRepair.swapCount} 次（偏差改善 ${majorMixRepair.majorL1Gain}）`);
        }
        if (shiftBalanceStats.violationTotal > 0) {
            shiftBalanceStats.violations.slice(0, 10).forEach((v) => {
                warnings.push(
                    `班别${v.shift} 员工${v.sid}六类总量偏差超阈值: ${v.actual}/${v.target} (diff=${v.diff}, tol=${v.tolerance})`
                );
            });
        }

        return {
            functionTargets,
            staffFunctionTargets,
            staffFunctionCounts,
            dailyFunctionStats,
            functionScheduleByStaff,
            warnings,
            shiftBalanceRepair,
            majorShiftRepair,
            majorMixRepair,
            shiftBalanceStats,
            shanghaiFunctionThirdTarget,
            actualTotalAssignments
        };
    },

    pickFunctionForSlot(ctx) {
        const {
            sid,
            date,
            staffFunctionCounts,
            monthlyAssigned,
            dailyFunctionStats,
            dailyFunctionTargets,
            functionTargets,
            staffFunctionTargets,
            staffRecentFunctionState,
            staffAssignmentCount,
            functionBalanceM,
            rng,
            dateQuota = null,
            functionAllocationMode = 'monthly',
            candidateFunctions = null,
            majorFunctionPersonalRatioEnabled = true
        } = ctx;

        let candidates = Array.isArray(candidateFunctions) && candidateFunctions.length > 0
            ? candidateFunctions.slice()
            : this.FUNCTION_TYPES.slice();
        if (candidates.length === 0) {
            const positiveNeed = this.FUNCTION_TYPES.filter((f) => (functionTargets[f] - monthlyAssigned[f]) > 0);
            candidates = positiveNeed.length > 0 ? positiveNeed : this.FUNCTION_TYPES.slice();
        }

        let bestF = candidates[0];
        let bestScore = -Infinity;
        const mode = String(functionAllocationMode || '').toLowerCase() === 'daily' ? 'daily' : 'monthly';
        const quotaWeight = mode === 'daily' ? 500 : 40;
        const dailyGapWeight = mode === 'daily' ? 80 : 8;
        const dailyOverPenalty = mode === 'daily' ? 280 : 25;
        const monthlyNeedWeight = mode === 'daily' ? 12 : 30;
        const personalTarget = staffFunctionTargets?.[sid] || {};
        const recentState = staffRecentFunctionState?.[sid] || { lastFunction: '', streak: 0 };
        const staffTotalAssigned = Math.max(0, this.normalizeNumber(staffAssignmentCount?.[sid], 0));
        const balanceLimit = this.getStaffFunctionBalanceLimit(staffTotalAssigned, functionBalanceM);
        const currentSixTotal = this.BALANCE_FUNCTIONS.reduce((sum, fn) => {
            return sum + this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
        }, 0);
        const targetSixTotal = this.BALANCE_FUNCTIONS.reduce((sum, fn) => {
            return sum + this.normalizeNumber(personalTarget?.[fn], 0);
        }, 0);
        const majorTargetDevBefore = this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
            return sum + Math.abs(
                this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0)
                - this.normalizeNumber(personalTarget?.[fn], 0)
            );
        }, 0);

        candidates.forEach((f) => {
            const need = (functionTargets[f] - monthlyAssigned[f]);
            let score = need * monthlyNeedWeight;
            const isMajorFunction = this.MAJOR_FUNCTIONS.includes(f);
            const applyMajorPersonalRule = majorFunctionPersonalRatioEnabled !== false;
            const applyPersonalNeed = !isMajorFunction || applyMajorPersonalRule;
            const personalNeed = this.normalizeNumber(personalTarget[f], 0) - this.normalizeNumber(staffFunctionCounts?.[sid]?.[f], 0);
            if (applyPersonalNeed) {
                const personalNeedWeight = (isMajorFunction && applyMajorPersonalRule) ? 120 : 85;
                score += personalNeed * personalNeedWeight;
                if (personalNeed <= 0) {
                    const overAssignPenalty = (isMajorFunction && applyMajorPersonalRule) ? 55 : 35;
                    score += personalNeed * overAssignPenalty;
                }
            }
            if (isMajorFunction && applyMajorPersonalRule) {
                const majorDevBefore = this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                    return sum + Math.abs(
                        this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0)
                        - this.normalizeNumber(personalTarget?.[fn], 0)
                    );
                }, 0);
                const majorDevAfter = this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                    const base = this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
                    const next = fn === f ? (base + 1) : base;
                    return sum + Math.abs(next - this.normalizeNumber(personalTarget?.[fn], 0));
                }, 0);
                score += (majorDevBefore - majorDevAfter) * 95;
            }
            if (applyMajorPersonalRule) {
                const majorTargetDevAfter = this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                    const base = this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
                    const next = fn === f ? (base + 1) : base;
                    return sum + Math.abs(next - this.normalizeNumber(personalTarget?.[fn], 0));
                }, 0);
                score += (majorTargetDevBefore - majorTargetDevAfter) * 135;
            }

            const sixAfter = currentSixTotal + (this.BALANCE_FUNCTIONS.includes(f) ? 1 : 0);
            score += (Math.abs(currentSixTotal - targetSixTotal) - Math.abs(sixAfter - targetSixTotal)) * 90;

            const quotaRemain = this.normalizeNumber(dateQuota?.[f], 0);
            score += quotaRemain * quotaWeight;

            const dailyTarget = this.normalizeNumber(dailyFunctionTargets?.[date]?.[f], 0);
            const dailyActual = this.normalizeNumber(dailyFunctionStats?.[date]?.[f], 0);
            const dailyGap = dailyTarget - dailyActual;
            score += dailyGap * dailyGapWeight;
            if (dailyActual >= (dailyTarget + 1)) {
                score -= (dailyActual - dailyTarget) * dailyOverPenalty;
            }
            const dayTotalSoFar = this.FUNCTION_TYPES.reduce((sum, skill) => {
                return sum + this.normalizeNumber(dailyFunctionStats?.[date]?.[skill], 0);
            }, 0);
            const projectedTotal = dayTotalSoFar + 1;
            const projectedFn = dailyActual + 1;
            const projectedShare = projectedTotal > 0 ? (projectedFn / projectedTotal) : 0;
            if (projectedTotal >= 6 && projectedShare > 0.65) {
                score -= (projectedShare - 0.65) * 5000;
            }
            const staffCurrentTotal = this.FUNCTION_TYPES.reduce((sum, skill) => {
                return sum + this.normalizeNumber(staffFunctionCounts?.[sid]?.[skill], 0);
            }, 0);
            const projectedStaffShare = (staffCurrentTotal + 1) > 0
                ? ((this.normalizeNumber(staffFunctionCounts?.[sid]?.[f], 0) + 1) / (staffCurrentTotal + 1))
                : 0;
            if (staffCurrentTotal >= 5 && projectedStaffShare > 0.45) {
                score -= (projectedStaffShare - 0.45) * 420;
            }
            if (recentState.lastFunction === f) {
                score -= Math.max(1, this.normalizeNumber(recentState.streak, 0)) * 95;
            }

            if (this.BALANCE_FUNCTIONS.includes(f)) {
                const fake = { ...staffFunctionCounts[sid] };
                fake[f] = (fake[f] || 0) + 1;
                const vals = this.BALANCE_FUNCTIONS.map(x => fake[x] || 0);
                const diff = Math.max(...vals) - Math.min(...vals);
                score += (balanceLimit - diff) * 12;
            }
            if (this.MAJOR_FUNCTIONS.includes(f) && applyMajorPersonalRule) {
                const fake = { ...staffFunctionCounts[sid] };
                fake[f] = (fake[f] || 0) + 1;
                const vals = this.MAJOR_FUNCTIONS.map((x) => fake[x] || 0);
                const diff = Math.max(...vals) - Math.min(...vals);
                const majorLimit = this.getStaffMajorFunctionBalanceLimit(staffTotalAssigned + 1);
                score += (majorLimit - diff) * 60;
            }

            score += rng.random();

            if (score > bestScore) {
                bestScore = score;
                bestF = f;
            }
        });

        return bestF;
    },

    rebalanceStaffFunctions(ctx) {
        const {
            allAssignments,
            staffFunctionCounts,
            monthlyAssigned,
            dailyFunctionStats,
            dailyFunctionTargets,
            functionTargets,
            staffFunctionTargets,
            staffAssignmentCount,
            functionBalanceM,
            rng,
            candidateFunctions = null
        } = ctx;
        const candidateList = (Array.isArray(candidateFunctions) && candidateFunctions.length > 0)
            ? candidateFunctions.slice()
            : this.FUNCTION_TYPES.slice();

        const slotsByStaff = {};
        allAssignments.forEach((slot) => {
            if (!slotsByStaff[slot.sid]) slotsByStaff[slot.sid] = [];
            slotsByStaff[slot.sid].push(slot);
        });

        const maxIterations = 3000;
        for (let iter = 0; iter < maxIterations; iter++) {
            let changed = false;

            Object.keys(staffFunctionCounts).forEach((sid) => {
                const cnt = staffFunctionCounts[sid] || {};
                const staffTarget = staffFunctionTargets?.[sid] || {};
                const balanceLimit = this.getStaffFunctionBalanceLimit(
                    staffAssignmentCount?.[sid],
                    functionBalanceM
                );
                const values = this.BALANCE_FUNCTIONS.map((f) => cnt[f] || 0);
                const maxVal = Math.max(...values);
                const minVal = Math.min(...values);
                const highFns = candidateList
                    .filter((f) => this.normalizeNumber(cnt[f], 0) > this.normalizeNumber(staffTarget[f], 0))
                    .sort((a, b) => {
                        const surplusA = this.normalizeNumber(cnt[a], 0) - this.normalizeNumber(staffTarget[a], 0);
                        const surplusB = this.normalizeNumber(cnt[b], 0) - this.normalizeNumber(staffTarget[b], 0);
                        if (surplusB !== surplusA) return surplusB - surplusA;
                        return this.normalizeNumber(cnt[b], 0) - this.normalizeNumber(cnt[a], 0);
                    });
                const lowFns = candidateList
                    .filter((f) => this.normalizeNumber(cnt[f], 0) < this.normalizeNumber(staffTarget[f], 0))
                    .sort((a, b) => {
                        const deficitA = this.normalizeNumber(staffTarget[a], 0) - this.normalizeNumber(cnt[a], 0);
                        const deficitB = this.normalizeNumber(staffTarget[b], 0) - this.normalizeNumber(cnt[b], 0);
                        if (deficitB !== deficitA) return deficitB - deficitA;
                        return (functionTargets[b] || 0) - (functionTargets[a] || 0);
                    });

                if (highFns.length === 0 || lowFns.length === 0) {
                    if (maxVal - minVal <= balanceLimit) return;
                    const fallbackHigh = candidateList.filter((f) => (cnt[f] || 0) === maxVal);
                    const fallbackLow = candidateList.filter((f) => (cnt[f] || 0) === minVal);
                    if (fallbackHigh.length === 0 || fallbackLow.length === 0) return;
                    highFns.push(fallbackHigh[0]);
                    lowFns.push(fallbackLow[0]);
                }

                let bestMove = null;
                highFns.forEach((fromFn) => {
                    lowFns.forEach((toFn) => {
                        if (!toFn || fromFn === toFn) return;
                        const monthlyBefore =
                            Math.abs(this.normalizeNumber(monthlyAssigned[fromFn], 0) - this.normalizeNumber(functionTargets[fromFn], 0)) +
                            Math.abs(this.normalizeNumber(monthlyAssigned[toFn], 0) - this.normalizeNumber(functionTargets[toFn], 0));
                        const monthlyAfter =
                            Math.abs((this.normalizeNumber(monthlyAssigned[fromFn], 0) - 1) - this.normalizeNumber(functionTargets[fromFn], 0)) +
                            Math.abs((this.normalizeNumber(monthlyAssigned[toFn], 0) + 1) - this.normalizeNumber(functionTargets[toFn], 0));
                        if (monthlyAfter > monthlyBefore + 1) return;

                        const personalBefore =
                            Math.abs(this.normalizeNumber(cnt[fromFn], 0) - this.normalizeNumber(staffTarget[fromFn], 0)) +
                            Math.abs(this.normalizeNumber(cnt[toFn], 0) - this.normalizeNumber(staffTarget[toFn], 0));
                        const personalAfter =
                            Math.abs((this.normalizeNumber(cnt[fromFn], 0) - 1) - this.normalizeNumber(staffTarget[fromFn], 0)) +
                            Math.abs((this.normalizeNumber(cnt[toFn], 0) + 1) - this.normalizeNumber(staffTarget[toFn], 0));
                        if (personalAfter >= personalBefore && maxVal - minVal <= balanceLimit) return;

                        (slotsByStaff[sid] || []).forEach((slot) => {
                            if (slot.function !== fromFn) return;
                            const date = slot.date;
                            const currFromDaily = this.normalizeNumber(dailyFunctionStats?.[date]?.[fromFn], 0);
                            const currToDaily = this.normalizeNumber(dailyFunctionStats?.[date]?.[toFn], 0);
                            const targetFromDaily = this.normalizeNumber(dailyFunctionTargets?.[date]?.[fromFn], 0);
                            const targetToDaily = this.normalizeNumber(dailyFunctionTargets?.[date]?.[toFn], 0);
                            const beforeDev = Math.abs(currFromDaily - targetFromDaily) + Math.abs(currToDaily - targetToDaily);
                            const afterDev = Math.abs((currFromDaily - 1) - targetFromDaily) + Math.abs((currToDaily + 1) - targetToDaily);
                            if (afterDev > beforeDev + 1) return;

                            const score =
                                (personalBefore - personalAfter) * 120 +
                                (monthlyBefore - monthlyAfter) * 35 +
                                (beforeDev - afterDev) * 18 +
                                rng.random();
                            if (!bestMove || score > bestMove.score) {
                                bestMove = { sid, fromFn, toFn, date, score };
                            }
                        });
                    });
                });

                if (!bestMove) return;

                const slot = (slotsByStaff[sid] || []).find((s) => s.date === bestMove.date && s.function === bestMove.fromFn);
                if (!slot) return;

                slot.function = bestMove.toFn;
                staffFunctionCounts[sid][bestMove.fromFn] -= 1;
                staffFunctionCounts[sid][bestMove.toFn] += 1;
                monthlyAssigned[bestMove.fromFn] -= 1;
                monthlyAssigned[bestMove.toFn] += 1;
                if (dailyFunctionStats?.[bestMove.date]) {
                    dailyFunctionStats[bestMove.date][bestMove.fromFn] = Math.max(0, this.normalizeNumber(dailyFunctionStats[bestMove.date][bestMove.fromFn], 0) - 1);
                    dailyFunctionStats[bestMove.date][bestMove.toFn] = this.normalizeNumber(dailyFunctionStats[bestMove.date][bestMove.toFn], 0) + 1;
                }
                changed = true;
            });

            if (!changed) break;
        }
    },

    rebalanceStaffMajorFunctions(ctx) {
        const {
            allAssignments,
            staffFunctionCounts,
            monthlyAssigned,
            dailyFunctionStats,
            dailyFunctionTargets,
            functionTargets,
            staffFunctionTargets,
            staffAssignmentCount,
            rng,
            maxIterations = 3200
        } = ctx;

        const slotsByStaff = {};
        allAssignments.forEach((slot) => {
            if (!slotsByStaff[slot.sid]) slotsByStaff[slot.sid] = [];
            slotsByStaff[slot.sid].push(slot);
        });

        const calcMajorState = (cnt, staffTarget) => {
            const vals = this.MAJOR_FUNCTIONS.map((f) => this.normalizeNumber(cnt[f], 0));
            const diff = vals.length > 0 ? (Math.max(...vals) - Math.min(...vals)) : 0;
            const targetDeviation = this.MAJOR_FUNCTIONS.reduce((sum, f) => {
                return sum + Math.abs(
                    this.normalizeNumber(cnt[f], 0) - this.normalizeNumber(staffTarget[f], 0)
                );
            }, 0);
            return { diff, targetDeviation };
        };
        const getTargetTolerance = (total) => {
            if (total <= 6) return 1;
            if (total <= 12) return 2;
            if (total <= 18) return 2;
            return 3;
        };

        const iterLimit = Math.max(100, Math.floor(this.normalizeNumber(maxIterations, 3200)));
        for (let iter = 0; iter < iterLimit; iter++) {
            let changed = false;

            Object.keys(staffFunctionCounts).forEach((sid) => {
                const cnt = staffFunctionCounts[sid] || {};
                const staffTarget = staffFunctionTargets?.[sid] || {};
                const totalAssigned = Math.max(0, Math.floor(this.normalizeNumber(staffAssignmentCount?.[sid], 0)));
                if (totalAssigned <= 0) return;

                const beforeState = calcMajorState(cnt, staffTarget);
                const balanceLimit = this.getStaffMajorFunctionBalanceLimit(totalAssigned);
                const targetTolerance = getTargetTolerance(totalAssigned);
                const needDiffFix = beforeState.diff > balanceLimit;
                const needTargetFix = beforeState.targetDeviation > targetTolerance;
                if (!needDiffFix && !needTargetFix) return;

                let highFns = this.MAJOR_FUNCTIONS
                    .filter((f) => this.normalizeNumber(cnt[f], 0) > this.normalizeNumber(staffTarget[f], 0))
                    .sort((a, b) => {
                        const surplusA = this.normalizeNumber(cnt[a], 0) - this.normalizeNumber(staffTarget[a], 0);
                        const surplusB = this.normalizeNumber(cnt[b], 0) - this.normalizeNumber(staffTarget[b], 0);
                        if (surplusB !== surplusA) return surplusB - surplusA;
                        return this.normalizeNumber(cnt[b], 0) - this.normalizeNumber(cnt[a], 0);
                    });
                let lowFns = this.MAJOR_FUNCTIONS
                    .filter((f) => this.normalizeNumber(cnt[f], 0) < this.normalizeNumber(staffTarget[f], 0))
                    .sort((a, b) => {
                        const deficitA = this.normalizeNumber(staffTarget[a], 0) - this.normalizeNumber(cnt[a], 0);
                        const deficitB = this.normalizeNumber(staffTarget[b], 0) - this.normalizeNumber(cnt[b], 0);
                        if (deficitB !== deficitA) return deficitB - deficitA;
                        return (functionTargets[b] || 0) - (functionTargets[a] || 0);
                    });
                if (highFns.length === 0) {
                    highFns = this.MAJOR_FUNCTIONS.slice().sort((a, b) => {
                        return this.normalizeNumber(cnt[b], 0) - this.normalizeNumber(cnt[a], 0);
                    });
                }
                if (lowFns.length === 0) {
                    lowFns = this.MAJOR_FUNCTIONS.slice().sort((a, b) => {
                        return this.normalizeNumber(cnt[a], 0) - this.normalizeNumber(cnt[b], 0);
                    });
                }
                if (highFns.length === 0 || lowFns.length === 0) return;

                let bestMove = null;
                highFns.forEach((fromFn) => {
                    lowFns.forEach((toFn) => {
                        if (!toFn || fromFn === toFn) return;

                        const monthlyBefore =
                            Math.abs(this.normalizeNumber(monthlyAssigned[fromFn], 0) - this.normalizeNumber(functionTargets[fromFn], 0)) +
                            Math.abs(this.normalizeNumber(monthlyAssigned[toFn], 0) - this.normalizeNumber(functionTargets[toFn], 0));
                        const monthlyAfter =
                            Math.abs((this.normalizeNumber(monthlyAssigned[fromFn], 0) - 1) - this.normalizeNumber(functionTargets[fromFn], 0)) +
                            Math.abs((this.normalizeNumber(monthlyAssigned[toFn], 0) + 1) - this.normalizeNumber(functionTargets[toFn], 0));
                        const monthlyTolerance = needDiffFix ? 4 : 2;
                        if (monthlyAfter > monthlyBefore + monthlyTolerance) return;

                        (slotsByStaff[sid] || []).forEach((slot) => {
                            if (slot.function !== fromFn) return;
                            const date = slot.date;
                            const currFromDaily = this.normalizeNumber(dailyFunctionStats?.[date]?.[fromFn], 0);
                            const currToDaily = this.normalizeNumber(dailyFunctionStats?.[date]?.[toFn], 0);
                            const targetFromDaily = this.normalizeNumber(dailyFunctionTargets?.[date]?.[fromFn], 0);
                            const targetToDaily = this.normalizeNumber(dailyFunctionTargets?.[date]?.[toFn], 0);
                            const beforeDev = Math.abs(currFromDaily - targetFromDaily) + Math.abs(currToDaily - targetToDaily);
                            const afterDev = Math.abs((currFromDaily - 1) - targetFromDaily) + Math.abs((currToDaily + 1) - targetToDaily);
                            const dailyTolerance = needDiffFix ? 3 : 2;
                            if (afterDev > beforeDev + dailyTolerance) return;

                            const fake = { ...cnt };
                            fake[fromFn] = this.normalizeNumber(fake[fromFn], 0) - 1;
                            fake[toFn] = this.normalizeNumber(fake[toFn], 0) + 1;
                            const afterState = calcMajorState(fake, staffTarget);
                            const diffImprove = beforeState.diff - afterState.diff;
                            const targetImprove = beforeState.targetDeviation - afterState.targetDeviation;

                            if (needDiffFix && diffImprove <= 0) return;
                            if (needTargetFix && targetImprove <= 0) return;
                            if (diffImprove <= 0 && targetImprove <= 0) return;

                            const score =
                                diffImprove * 260 +
                                targetImprove * 220 +
                                (monthlyBefore - monthlyAfter) * 8 +
                                (beforeDev - afterDev) * 5 +
                                rng.random();
                            if (!bestMove || score > bestMove.score) {
                                bestMove = { sid, fromFn, toFn, date, score };
                            }
                        });
                    });
                });

                if (!bestMove) return;

                const slot = (slotsByStaff[sid] || []).find((s) => s.date === bestMove.date && s.function === bestMove.fromFn);
                if (!slot) return;

                slot.function = bestMove.toFn;
                staffFunctionCounts[sid][bestMove.fromFn] -= 1;
                staffFunctionCounts[sid][bestMove.toFn] += 1;
                monthlyAssigned[bestMove.fromFn] -= 1;
                monthlyAssigned[bestMove.toFn] += 1;
                if (dailyFunctionStats?.[bestMove.date]) {
                    dailyFunctionStats[bestMove.date][bestMove.fromFn] = Math.max(0, this.normalizeNumber(dailyFunctionStats[bestMove.date][bestMove.fromFn], 0) - 1);
                    dailyFunctionStats[bestMove.date][bestMove.toFn] = this.normalizeNumber(dailyFunctionStats[bestMove.date][bestMove.toFn], 0) + 1;
                }
                changed = true;
            });

            if (!changed) break;
        }
    },

    allocateWeightedIntegerTargets(keys, total, weightByKey, rng) {
        const out = {};
        const keyList = Array.isArray(keys) ? keys.slice() : [];
        const targetTotal = Math.max(0, Math.floor(this.normalizeNumber(total, 0)));
        if (keyList.length === 0) return out;

        keyList.forEach((k) => {
            out[k] = 0;
        });
        if (targetTotal <= 0) {
            return out;
        }

        const weights = {};
        let weightSum = 0;
        keyList.forEach((k) => {
            const w = Math.max(0, this.normalizeNumber(weightByKey?.[k], 0));
            weights[k] = w;
            weightSum += w;
        });
        if (weightSum <= 0) {
            keyList.forEach((k) => {
                weights[k] = 1;
            });
            weightSum = keyList.length;
        }

        const remainders = [];
        let assigned = 0;
        keyList.forEach((k) => {
            const raw = targetTotal * (weights[k] / Math.max(1e-9, weightSum));
            const base = Math.floor(raw);
            out[k] = base;
            assigned += base;
            remainders.push({ key: k, frac: raw - base });
        });
        remainders.sort((a, b) => {
            if (b.frac !== a.frac) return b.frac - a.frac;
            const ra = rng && typeof rng.random === 'function' ? rng.random() : Math.random();
            const rb = rng && typeof rng.random === 'function' ? rng.random() : Math.random();
            return rb - ra;
        });
        let left = targetTotal - assigned;
        let idx = 0;
        while (left > 0 && remainders.length > 0) {
            const pick = remainders[idx % remainders.length].key;
            out[pick] = this.normalizeNumber(out[pick], 0) + 1;
            left -= 1;
            idx += 1;
        }

        return out;
    },

    collectShiftStaffBalanceFunctionTotalStats(ctx) {
        const {
            staffFunctionCounts = {},
            staffAssignmentCount = {},
            allAssignments = [],
            shiftBalanceSixTotalTolerance = 1
        } = ctx || {};

        const tolerance = Math.max(0, Math.floor(this.normalizeNumber(shiftBalanceSixTotalTolerance, 1)));
        const shiftByStaff = {};
        (allAssignments || []).forEach((slot) => {
            const sid = String(slot?.sid || '').trim();
            const shift = String(slot?.shift || '').trim();
            if (!sid || !this.SHIFT_TYPES.includes(shift)) return;
            if (!shiftByStaff[sid]) {
                shiftByStaff[sid] = shift;
            }
        });

        const shiftMeta = {};
        Object.keys(staffAssignmentCount || {}).forEach((sidRaw) => {
            const sid = String(sidRaw || '').trim();
            if (!sid) return;
            const shift = String(shiftByStaff[sid] || '').trim();
            if (!this.SHIFT_TYPES.includes(shift)) return;
            const assigned = Math.max(0, Math.floor(this.normalizeNumber(staffAssignmentCount[sid], 0)));
            if (assigned <= 0) return;
            const sixTotal = this.BALANCE_FUNCTIONS.reduce((sum, fn) => {
                return sum + this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
            }, 0);
            if (!shiftMeta[shift]) {
                shiftMeta[shift] = {
                    staffIds: [],
                    totalAssigned: 0,
                    totalSix: 0
                };
            }
            shiftMeta[shift].staffIds.push(sid);
            shiftMeta[shift].totalAssigned += assigned;
            shiftMeta[shift].totalSix += sixTotal;
        });

        const targetByStaff = {};
        Object.keys(shiftMeta).forEach((shift) => {
            const staffIds = (shiftMeta[shift].staffIds || []).slice().sort((a, b) => String(a).localeCompare(String(b)));
            const weights = {};
            staffIds.forEach((sid) => {
                weights[sid] = Math.max(0, this.normalizeNumber(staffAssignmentCount[sid], 0));
            });
            const targets = this.allocateWeightedIntegerTargets(
                staffIds,
                Math.max(0, Math.floor(this.normalizeNumber(shiftMeta[shift].totalSix, 0))),
                weights,
                null
            );
            staffIds.forEach((sid) => {
                targetByStaff[sid] = Math.max(0, Math.floor(this.normalizeNumber(targets[sid], 0)));
            });
        });

        const violations = [];
        let violationTotal = 0;
        Object.keys(targetByStaff).forEach((sid) => {
            const shift = String(shiftByStaff[sid] || '').trim();
            if (!this.SHIFT_TYPES.includes(shift)) return;
            const actual = this.BALANCE_FUNCTIONS.reduce((sum, fn) => {
                return sum + this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
            }, 0);
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetByStaff[sid], 0)));
            const diff = actual - target;
            const excess = Math.max(0, Math.abs(diff) - tolerance);
            if (excess > 0) {
                violationTotal += excess;
                violations.push({
                    shift,
                    sid,
                    actual,
                    target,
                    diff,
                    tolerance
                });
            }
        });
        violations.sort((a, b) => {
            const ea = Math.max(0, Math.abs(this.normalizeNumber(a.diff, 0)) - tolerance);
            const eb = Math.max(0, Math.abs(this.normalizeNumber(b.diff, 0)) - tolerance);
            if (eb !== ea) return eb - ea;
            if (a.shift !== b.shift) return String(a.shift).localeCompare(String(b.shift));
            return String(a.sid).localeCompare(String(b.sid));
        });

        return {
            tolerance,
            shiftMeta,
            targetByStaff,
            violations,
            violationTotal,
            violationStaff: violations.length
        };
    },

    rebalanceShiftStaffBalanceFunctionTotals(ctx) {
        const {
            allAssignments,
            staffFunctionCounts,
            staffFunctionTargets = {},
            staffAssignmentCount = {},
            functionBalanceM = 2,
            shiftBalanceSixTotalTolerance = 1,
            majorFunctionPersonalRatioEnabled = true,
            rng,
            maxIterations = 2200
        } = ctx || {};

        const assignments = Array.isArray(allAssignments) ? allAssignments : [];
        if (assignments.length === 0) {
            return { swapCount: 0, violationTotal: 0, violationStaff: 0 };
        }

        const random = (rng && typeof rng.random === 'function')
            ? () => rng.random()
            : () => Math.random();
        const tolerance = Math.max(0, Math.floor(this.normalizeNumber(shiftBalanceSixTotalTolerance, 1)));
        const initialStats = this.collectShiftStaffBalanceFunctionTotalStats({
            staffFunctionCounts,
            staffAssignmentCount,
            allAssignments: assignments,
            shiftBalanceSixTotalTolerance: tolerance
        });
        if (initialStats.violationTotal <= 0) {
            return { swapCount: 0, violationTotal: 0, violationStaff: 0 };
        }

        const targetByStaff = initialStats.targetByStaff || {};
        const slotsByStaffDate = {};
        const shiftByStaff = {};
        assignments.forEach((slot) => {
            const sid = String(slot?.sid || '').trim();
            const date = String(slot?.date || '').trim();
            const shift = String(slot?.shift || '').trim();
            if (!sid || !date || !this.SHIFT_TYPES.includes(shift)) return;
            if (!slotsByStaffDate[sid]) slotsByStaffDate[sid] = {};
            slotsByStaffDate[sid][date] = slot;
            if (!shiftByStaff[sid]) shiftByStaff[sid] = shift;
        });

        const balanceTotalByStaff = {};
        Object.keys(targetByStaff || {}).forEach((sid) => {
            balanceTotalByStaff[sid] = this.BALANCE_FUNCTIONS.reduce((sum, fn) => {
                return sum + this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
            }, 0);
        });
        const getShift = (sid) => String(shiftByStaff[String(sid)] || '').trim();
        const getDiff = (sid) => {
            const key = String(sid || '').trim();
            return this.normalizeNumber(balanceTotalByStaff[key], 0) - this.normalizeNumber(targetByStaff[key], 0);
        };
        const getViolationExcess = (sid) => {
            return Math.max(0, Math.abs(getDiff(sid)) - tolerance);
        };
        const getMajorDeviation = (sid, countMap = null) => {
            if (majorFunctionPersonalRatioEnabled === false) return 0;
            const key = String(sid || '').trim();
            const counts = countMap || staffFunctionCounts?.[key] || {};
            const target = staffFunctionTargets?.[key] || {};
            return this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                return sum + Math.abs(
                    this.normalizeNumber(counts[fn], 0) - this.normalizeNumber(target[fn], 0)
                );
            }, 0);
        };
        const getBalanceDiffExcess = (sid, countMap = null) => {
            const key = String(sid || '').trim();
            const counts = countMap || staffFunctionCounts?.[key] || {};
            const vals = this.BALANCE_FUNCTIONS.map((fn) => this.normalizeNumber(counts[fn], 0));
            const diff = vals.length > 0 ? (Math.max(...vals) - Math.min(...vals)) : 0;
            const limit = this.getStaffFunctionBalanceLimit(
                staffAssignmentCount?.[key],
                functionBalanceM
            );
            return Math.max(0, diff - limit);
        };

        const shiftToStaff = {};
        Object.keys(targetByStaff || {}).forEach((sid) => {
            const shift = getShift(sid);
            if (!this.SHIFT_TYPES.includes(shift)) return;
            if (!shiftToStaff[shift]) shiftToStaff[shift] = [];
            shiftToStaff[shift].push(sid);
        });
        Object.keys(shiftToStaff).forEach((shift) => {
            shiftToStaff[shift].sort((a, b) => String(a).localeCompare(String(b)));
        });

        let swapCount = 0;
        const iterLimit = Math.max(80, Math.floor(this.normalizeNumber(maxIterations, 2200)));
        for (let iter = 0; iter < iterLimit; iter++) {
            let bestMove = null;

            Object.keys(shiftToStaff).forEach((shift) => {
                const staffIds = shiftToStaff[shift] || [];
                if (staffIds.length < 2) return;
                const donors = staffIds
                    .filter((sid) => getDiff(sid) > tolerance)
                    .sort((a, b) => getDiff(b) - getDiff(a))
                    .slice(0, 8);
                const receivers = staffIds
                    .filter((sid) => getDiff(sid) < -tolerance)
                    .sort((a, b) => getDiff(a) - getDiff(b))
                    .slice(0, 8);
                if (donors.length === 0 || receivers.length === 0) return;

                donors.forEach((donorSid) => {
                    const donorSlots = Object.values(slotsByStaffDate[donorSid] || {})
                        .filter((slot) => String(slot?.shift || '') === shift && this.BALANCE_FUNCTIONS.includes(String(slot?.function || '')));
                    if (donorSlots.length === 0) return;
                    receivers.forEach((receiverSid) => {
                        if (receiverSid === donorSid) return;
                        donorSlots.forEach((donorSlot) => {
                            const date = String(donorSlot?.date || '').trim();
                            if (!date) return;
                            const receiverSlot = slotsByStaffDate?.[receiverSid]?.[date];
                            if (!receiverSlot || String(receiverSlot.shift || '') !== shift) return;
                            const donorFn = String(donorSlot.function || '').trim();
                            const receiverFn = String(receiverSlot.function || '').trim();
                            if (!this.BALANCE_FUNCTIONS.includes(donorFn)) return;
                            if (!receiverFn || this.BALANCE_FUNCTIONS.includes(receiverFn)) return;
                            if (donorFn === receiverFn) return;

                            const beforeViolation = getViolationExcess(donorSid) + getViolationExcess(receiverSid);
                            const afterDiffDonor = getDiff(donorSid) - 1;
                            const afterDiffReceiver = getDiff(receiverSid) + 1;
                            const afterViolation =
                                Math.max(0, Math.abs(afterDiffDonor) - tolerance) +
                                Math.max(0, Math.abs(afterDiffReceiver) - tolerance);
                            const violationGain = beforeViolation - afterViolation;
                            if (violationGain <= 0) return;

                            const donorCnt = staffFunctionCounts?.[donorSid] || {};
                            const receiverCnt = staffFunctionCounts?.[receiverSid] || {};
                            if (this.normalizeNumber(donorCnt[donorFn], 0) <= 0 || this.normalizeNumber(receiverCnt[receiverFn], 0) <= 0) return;
                            const donorAfter = { ...donorCnt };
                            const receiverAfter = { ...receiverCnt };
                            donorAfter[donorFn] = this.normalizeNumber(donorAfter[donorFn], 0) - 1;
                            donorAfter[receiverFn] = this.normalizeNumber(donorAfter[receiverFn], 0) + 1;
                            receiverAfter[receiverFn] = this.normalizeNumber(receiverAfter[receiverFn], 0) - 1;
                            receiverAfter[donorFn] = this.normalizeNumber(receiverAfter[donorFn], 0) + 1;
                            if (donorAfter[donorFn] < 0 || receiverAfter[receiverFn] < 0) return;

                            const majorBefore = getMajorDeviation(donorSid) + getMajorDeviation(receiverSid);
                            const majorAfter = getMajorDeviation(donorSid, donorAfter) + getMajorDeviation(receiverSid, receiverAfter);
                            if (majorFunctionPersonalRatioEnabled !== false && majorAfter > majorBefore + 2) return;

                            const balanceBefore = getBalanceDiffExcess(donorSid) + getBalanceDiffExcess(receiverSid);
                            const balanceAfter = getBalanceDiffExcess(donorSid, donorAfter) + getBalanceDiffExcess(receiverSid, receiverAfter);
                            if (balanceAfter > balanceBefore + 2) return;

                            const score =
                                violationGain * 1200 +
                                (majorBefore - majorAfter) * 120 +
                                (balanceBefore - balanceAfter) * 55 +
                                random();
                            if (!bestMove || score > bestMove.score) {
                                bestMove = {
                                    donorSid,
                                    receiverSid,
                                    donorSlot,
                                    receiverSlot,
                                    donorFn,
                                    receiverFn,
                                    score
                                };
                            }
                        });
                    });
                });
            });

            if (!bestMove) break;

            bestMove.donorSlot.function = bestMove.receiverFn;
            bestMove.receiverSlot.function = bestMove.donorFn;
            staffFunctionCounts[bestMove.donorSid][bestMove.donorFn] = Math.max(
                0,
                this.normalizeNumber(staffFunctionCounts[bestMove.donorSid][bestMove.donorFn], 0) - 1
            );
            staffFunctionCounts[bestMove.donorSid][bestMove.receiverFn] = this.normalizeNumber(
                staffFunctionCounts[bestMove.donorSid][bestMove.receiverFn],
                0
            ) + 1;
            staffFunctionCounts[bestMove.receiverSid][bestMove.receiverFn] = Math.max(
                0,
                this.normalizeNumber(staffFunctionCounts[bestMove.receiverSid][bestMove.receiverFn], 0) - 1
            );
            staffFunctionCounts[bestMove.receiverSid][bestMove.donorFn] = this.normalizeNumber(
                staffFunctionCounts[bestMove.receiverSid][bestMove.donorFn],
                0
            ) + 1;
            balanceTotalByStaff[bestMove.donorSid] = this.normalizeNumber(balanceTotalByStaff[bestMove.donorSid], 0) - 1;
            balanceTotalByStaff[bestMove.receiverSid] = this.normalizeNumber(balanceTotalByStaff[bestMove.receiverSid], 0) + 1;
            swapCount += 1;
        }

        const finalStats = this.collectShiftStaffBalanceFunctionTotalStats({
            staffFunctionCounts,
            staffAssignmentCount,
            allAssignments: assignments,
            shiftBalanceSixTotalTolerance: tolerance
        });

        return {
            swapCount,
            violationTotal: finalStats.violationTotal,
            violationStaff: finalStats.violationStaff
        };
    },

    rebalanceMajorRatioByShiftSwaps(ctx) {
        const {
            allAssignments,
            staffFunctionCounts,
            staffFunctionTargets = {},
            staffAssignmentCount = {},
            functionBalanceM = 2,
            shiftBalanceSixTotalTolerance = 1,
            rng,
            maxIterations = 2600
        } = ctx || {};

        const assignments = Array.isArray(allAssignments) ? allAssignments : [];
        if (assignments.length === 0) {
            return { swapCount: 0, majorGapGain: 0 };
        }

        const random = (rng && typeof rng.random === 'function')
            ? () => rng.random()
            : () => Math.random();
        const tolerance = Math.max(0, Math.floor(this.normalizeNumber(shiftBalanceSixTotalTolerance, 1)));

        const slotsByStaffDate = {};
        const shiftByStaff = {};
        assignments.forEach((slot) => {
            const sid = String(slot?.sid || '').trim();
            const date = String(slot?.date || '').trim();
            const shift = String(slot?.shift || '').trim();
            if (!sid || !date || !this.SHIFT_TYPES.includes(shift)) return;
            if (!slotsByStaffDate[sid]) slotsByStaffDate[sid] = {};
            slotsByStaffDate[sid][date] = slot;
            if (!shiftByStaff[sid]) shiftByStaff[sid] = shift;
        });

        const shiftStats = this.collectShiftStaffBalanceFunctionTotalStats({
            staffFunctionCounts,
            staffAssignmentCount,
            allAssignments: assignments,
            shiftBalanceSixTotalTolerance: tolerance
        });
        const shiftSixTargetByStaff = shiftStats?.targetByStaff || {};
        const majorTargetTotalByStaff = {};
        const majorTotalByStaff = {};
        const sixTotalByStaff = {};

        Object.keys(staffAssignmentCount || {}).forEach((sidRaw) => {
            const sid = String(sidRaw || '').trim();
            if (!sid) return;
            majorTargetTotalByStaff[sid] = this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                return sum + this.normalizeNumber(staffFunctionTargets?.[sid]?.[fn], 0);
            }, 0);
            majorTotalByStaff[sid] = this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                return sum + this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
            }, 0);
            sixTotalByStaff[sid] = this.BALANCE_FUNCTIONS.reduce((sum, fn) => {
                return sum + this.normalizeNumber(staffFunctionCounts?.[sid]?.[fn], 0);
            }, 0);
        });

        const shiftToStaff = {};
        Object.keys(majorTargetTotalByStaff).forEach((sid) => {
            const shift = String(shiftByStaff[sid] || '').trim();
            if (!this.SHIFT_TYPES.includes(shift)) return;
            if (!shiftToStaff[shift]) shiftToStaff[shift] = [];
            shiftToStaff[shift].push(sid);
        });
        Object.keys(shiftToStaff).forEach((shift) => {
            shiftToStaff[shift].sort((a, b) => String(a).localeCompare(String(b)));
        });

        const getMajorTotalGap = (sid) => {
            const key = String(sid || '').trim();
            return this.normalizeNumber(majorTotalByStaff[key], 0) - this.normalizeNumber(majorTargetTotalByStaff[key], 0);
        };
        const getMajorL1 = (sid, countMap = null) => {
            const key = String(sid || '').trim();
            const counts = countMap || staffFunctionCounts?.[key] || {};
            const target = staffFunctionTargets?.[key] || {};
            return this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                return sum + Math.abs(
                    this.normalizeNumber(counts[fn], 0) - this.normalizeNumber(target[fn], 0)
                );
            }, 0);
        };
        const getMajorDiffExcess = (sid, countMap = null) => {
            const key = String(sid || '').trim();
            const counts = countMap || staffFunctionCounts?.[key] || {};
            const vals = this.MAJOR_FUNCTIONS.map((fn) => this.normalizeNumber(counts[fn], 0));
            const diff = vals.length > 0 ? (Math.max(...vals) - Math.min(...vals)) : 0;
            const limit = this.getStaffMajorFunctionBalanceLimit(staffAssignmentCount?.[key]);
            return Math.max(0, diff - limit);
        };
        const getSixDiffExcess = (sid, countMap = null) => {
            const key = String(sid || '').trim();
            const counts = countMap || staffFunctionCounts?.[key] || {};
            const vals = this.BALANCE_FUNCTIONS.map((fn) => this.normalizeNumber(counts[fn], 0));
            const diff = vals.length > 0 ? (Math.max(...vals) - Math.min(...vals)) : 0;
            const limit = this.getStaffFunctionBalanceLimit(staffAssignmentCount?.[key], functionBalanceM);
            return Math.max(0, diff - limit);
        };
        const getShiftSixPenalty = (sid, sixTotal = null) => {
            const key = String(sid || '').trim();
            if (!Object.prototype.hasOwnProperty.call(shiftSixTargetByStaff, key)) return 0;
            const actual = sixTotal == null
                ? this.normalizeNumber(sixTotalByStaff[key], 0)
                : this.normalizeNumber(sixTotal, 0);
            const target = this.normalizeNumber(shiftSixTargetByStaff[key], 0);
            return Math.max(0, Math.abs(actual - target) - tolerance);
        };

        let swapCount = 0;
        let majorGapGain = 0;
        const iterLimit = Math.max(80, Math.floor(this.normalizeNumber(maxIterations, 2600)));
        for (let iter = 0; iter < iterLimit; iter++) {
            let bestMove = null;

            Object.keys(shiftToStaff).forEach((shift) => {
                const staffIds = shiftToStaff[shift] || [];
                if (staffIds.length < 2) return;
                const donors = staffIds
                    .filter((sid) => getMajorTotalGap(sid) > 0)
                    .sort((a, b) => getMajorTotalGap(b) - getMajorTotalGap(a))
                    .slice(0, 8);
                const receivers = staffIds
                    .filter((sid) => getMajorTotalGap(sid) < 0)
                    .sort((a, b) => getMajorTotalGap(a) - getMajorTotalGap(b))
                    .slice(0, 8);
                if (donors.length === 0 || receivers.length === 0) return;

                donors.forEach((donorSid) => {
                    const donorSlots = Object.values(slotsByStaffDate[donorSid] || {})
                        .filter((slot) => String(slot?.shift || '') === shift && this.MAJOR_FUNCTIONS.includes(String(slot?.function || '')));
                    if (donorSlots.length === 0) return;
                    receivers.forEach((receiverSid) => {
                        if (receiverSid === donorSid) return;
                        donorSlots.forEach((donorSlot) => {
                            const date = String(donorSlot?.date || '').trim();
                            if (!date) return;
                            const receiverSlot = slotsByStaffDate?.[receiverSid]?.[date];
                            if (!receiverSlot || String(receiverSlot.shift || '') !== shift) return;

                            const donorFn = String(donorSlot.function || '').trim();
                            const receiverFn = String(receiverSlot.function || '').trim();
                            if (!this.MAJOR_FUNCTIONS.includes(donorFn)) return;
                            if (!receiverFn || this.MAJOR_FUNCTIONS.includes(receiverFn)) return;

                            const donorCnt = staffFunctionCounts?.[donorSid] || {};
                            const receiverCnt = staffFunctionCounts?.[receiverSid] || {};
                            if (this.normalizeNumber(donorCnt[donorFn], 0) <= 0 || this.normalizeNumber(receiverCnt[receiverFn], 0) <= 0) return;

                            const donorAfter = { ...donorCnt };
                            const receiverAfter = { ...receiverCnt };
                            donorAfter[donorFn] = this.normalizeNumber(donorAfter[donorFn], 0) - 1;
                            donorAfter[receiverFn] = this.normalizeNumber(donorAfter[receiverFn], 0) + 1;
                            receiverAfter[receiverFn] = this.normalizeNumber(receiverAfter[receiverFn], 0) - 1;
                            receiverAfter[donorFn] = this.normalizeNumber(receiverAfter[donorFn], 0) + 1;
                            if (donorAfter[donorFn] < 0 || receiverAfter[receiverFn] < 0) return;

                            const beforeGap =
                                Math.abs(getMajorTotalGap(donorSid)) +
                                Math.abs(getMajorTotalGap(receiverSid));
                            const afterGap =
                                Math.abs(getMajorTotalGap(donorSid) - 1) +
                                Math.abs(getMajorTotalGap(receiverSid) + 1);
                            const gapGain = beforeGap - afterGap;
                            if (gapGain <= 0) return;

                            const majorBefore = getMajorL1(donorSid) + getMajorL1(receiverSid);
                            const majorAfter = getMajorL1(donorSid, donorAfter) + getMajorL1(receiverSid, receiverAfter);
                            const majorGain = majorBefore - majorAfter;
                            if (majorGain < 0) return;

                            const majorDiffBefore = getMajorDiffExcess(donorSid) + getMajorDiffExcess(receiverSid);
                            const majorDiffAfter = getMajorDiffExcess(donorSid, donorAfter) + getMajorDiffExcess(receiverSid, receiverAfter);
                            if (majorDiffAfter > majorDiffBefore + 1) return;

                            const donorSixAfter = this.normalizeNumber(sixTotalByStaff[donorSid], 0) + 1;
                            const receiverSixAfter = this.normalizeNumber(sixTotalByStaff[receiverSid], 0) - 1;
                            const shiftSixBefore = getShiftSixPenalty(donorSid) + getShiftSixPenalty(receiverSid);
                            const shiftSixAfter = getShiftSixPenalty(donorSid, donorSixAfter) + getShiftSixPenalty(receiverSid, receiverSixAfter);
                            if (shiftSixAfter > shiftSixBefore) return;

                            const sixDiffBefore = getSixDiffExcess(donorSid) + getSixDiffExcess(receiverSid);
                            const sixDiffAfter = getSixDiffExcess(donorSid, donorAfter) + getSixDiffExcess(receiverSid, receiverAfter);
                            if (sixDiffAfter > sixDiffBefore + 1) return;

                            const score =
                                gapGain * 1400 +
                                majorGain * 320 +
                                (majorDiffBefore - majorDiffAfter) * 160 +
                                (shiftSixBefore - shiftSixAfter) * 120 +
                                (sixDiffBefore - sixDiffAfter) * 50 +
                                random();
                            if (!bestMove || score > bestMove.score) {
                                bestMove = {
                                    donorSid,
                                    receiverSid,
                                    donorSlot,
                                    receiverSlot,
                                    donorFn,
                                    receiverFn,
                                    gapGain,
                                    score
                                };
                            }
                        });
                    });
                });
            });

            if (!bestMove) break;

            bestMove.donorSlot.function = bestMove.receiverFn;
            bestMove.receiverSlot.function = bestMove.donorFn;

            staffFunctionCounts[bestMove.donorSid][bestMove.donorFn] = Math.max(
                0,
                this.normalizeNumber(staffFunctionCounts[bestMove.donorSid][bestMove.donorFn], 0) - 1
            );
            staffFunctionCounts[bestMove.donorSid][bestMove.receiverFn] = this.normalizeNumber(
                staffFunctionCounts[bestMove.donorSid][bestMove.receiverFn],
                0
            ) + 1;
            staffFunctionCounts[bestMove.receiverSid][bestMove.receiverFn] = Math.max(
                0,
                this.normalizeNumber(staffFunctionCounts[bestMove.receiverSid][bestMove.receiverFn], 0) - 1
            );
            staffFunctionCounts[bestMove.receiverSid][bestMove.donorFn] = this.normalizeNumber(
                staffFunctionCounts[bestMove.receiverSid][bestMove.donorFn],
                0
            ) + 1;

            majorTotalByStaff[bestMove.donorSid] = this.normalizeNumber(majorTotalByStaff[bestMove.donorSid], 0) - 1;
            majorTotalByStaff[bestMove.receiverSid] = this.normalizeNumber(majorTotalByStaff[bestMove.receiverSid], 0) + 1;
            sixTotalByStaff[bestMove.donorSid] = this.normalizeNumber(sixTotalByStaff[bestMove.donorSid], 0) + 1;
            sixTotalByStaff[bestMove.receiverSid] = this.normalizeNumber(sixTotalByStaff[bestMove.receiverSid], 0) - 1;
            majorGapGain += this.normalizeNumber(bestMove.gapGain, 0);
            swapCount += 1;
        }

        return {
            swapCount,
            majorGapGain
        };
    },

    rebalanceMajorFunctionMixByShiftSwaps(ctx) {
        const {
            allAssignments,
            staffFunctionCounts,
            staffFunctionTargets = {},
            staffAssignmentCount = {},
            rng,
            maxIterations = 2200
        } = ctx || {};

        const assignments = Array.isArray(allAssignments) ? allAssignments : [];
        if (assignments.length === 0) {
            return { swapCount: 0, majorL1Gain: 0 };
        }

        const random = (rng && typeof rng.random === 'function')
            ? () => rng.random()
            : () => Math.random();

        const slotsByStaffDate = {};
        const shiftByStaff = {};
        assignments.forEach((slot) => {
            const sid = String(slot?.sid || '').trim();
            const date = String(slot?.date || '').trim();
            const shift = String(slot?.shift || '').trim();
            if (!sid || !date || !this.SHIFT_TYPES.includes(shift)) return;
            if (!slotsByStaffDate[sid]) slotsByStaffDate[sid] = {};
            slotsByStaffDate[sid][date] = slot;
            if (!shiftByStaff[sid]) shiftByStaff[sid] = shift;
        });

        const shiftToStaff = {};
        Object.keys(staffAssignmentCount || {}).forEach((sidRaw) => {
            const sid = String(sidRaw || '').trim();
            if (!sid) return;
            const shift = String(shiftByStaff[sid] || '').trim();
            if (!this.SHIFT_TYPES.includes(shift)) return;
            if (!shiftToStaff[shift]) shiftToStaff[shift] = [];
            shiftToStaff[shift].push(sid);
        });
        Object.keys(shiftToStaff).forEach((shift) => {
            shiftToStaff[shift].sort((a, b) => String(a).localeCompare(String(b)));
        });

        const getMajorL1 = (sid, countMap = null) => {
            const key = String(sid || '').trim();
            const counts = countMap || staffFunctionCounts?.[key] || {};
            const target = staffFunctionTargets?.[key] || {};
            return this.MAJOR_FUNCTIONS.reduce((sum, fn) => {
                return sum + Math.abs(
                    this.normalizeNumber(counts[fn], 0) - this.normalizeNumber(target[fn], 0)
                );
            }, 0);
        };
        const getMajorDiffExcess = (sid, countMap = null) => {
            const key = String(sid || '').trim();
            const counts = countMap || staffFunctionCounts?.[key] || {};
            const vals = this.MAJOR_FUNCTIONS.map((fn) => this.normalizeNumber(counts[fn], 0));
            const diff = vals.length > 0 ? (Math.max(...vals) - Math.min(...vals)) : 0;
            const limit = this.getStaffMajorFunctionBalanceLimit(staffAssignmentCount?.[key]);
            return Math.max(0, diff - limit);
        };

        let swapCount = 0;
        let majorL1Gain = 0;
        const iterLimit = Math.max(80, Math.floor(this.normalizeNumber(maxIterations, 2200)));
        for (let iter = 0; iter < iterLimit; iter++) {
            let bestMove = null;

            Object.keys(shiftToStaff).forEach((shift) => {
                const staffIds = shiftToStaff[shift] || [];
                if (staffIds.length < 2) return;
                for (let i = 0; i < staffIds.length; i++) {
                    const sidA = staffIds[i];
                    for (let j = i + 1; j < staffIds.length; j++) {
                        const sidB = staffIds[j];
                        const datesA = Object.keys(slotsByStaffDate[sidA] || {});
                        datesA.forEach((date) => {
                            const slotA = slotsByStaffDate?.[sidA]?.[date];
                            const slotB = slotsByStaffDate?.[sidB]?.[date];
                            if (!slotA || !slotB) return;
                            if (String(slotA.shift || '') !== shift || String(slotB.shift || '') !== shift) return;

                            const fnA = String(slotA.function || '').trim();
                            const fnB = String(slotB.function || '').trim();
                            if (!this.MAJOR_FUNCTIONS.includes(fnA) || !this.MAJOR_FUNCTIONS.includes(fnB)) return;
                            if (fnA === fnB) return;

                            const cntA = staffFunctionCounts?.[sidA] || {};
                            const cntB = staffFunctionCounts?.[sidB] || {};
                            if (this.normalizeNumber(cntA[fnA], 0) <= 0 || this.normalizeNumber(cntB[fnB], 0) <= 0) return;

                            const afterA = { ...cntA };
                            const afterB = { ...cntB };
                            afterA[fnA] = this.normalizeNumber(afterA[fnA], 0) - 1;
                            afterA[fnB] = this.normalizeNumber(afterA[fnB], 0) + 1;
                            afterB[fnB] = this.normalizeNumber(afterB[fnB], 0) - 1;
                            afterB[fnA] = this.normalizeNumber(afterB[fnA], 0) + 1;
                            if (afterA[fnA] < 0 || afterB[fnB] < 0) return;

                            const beforeL1 = getMajorL1(sidA) + getMajorL1(sidB);
                            const afterL1 = getMajorL1(sidA, afterA) + getMajorL1(sidB, afterB);
                            const l1Gain = beforeL1 - afterL1;
                            if (l1Gain <= 0) return;

                            const beforeDiff = getMajorDiffExcess(sidA) + getMajorDiffExcess(sidB);
                            const afterDiff = getMajorDiffExcess(sidA, afterA) + getMajorDiffExcess(sidB, afterB);
                            if (afterDiff > beforeDiff + 1) return;

                            const score =
                                l1Gain * 820 +
                                (beforeDiff - afterDiff) * 210 +
                                random();
                            if (!bestMove || score > bestMove.score) {
                                bestMove = {
                                    sidA,
                                    sidB,
                                    slotA,
                                    slotB,
                                    fnA,
                                    fnB,
                                    l1Gain,
                                    score
                                };
                            }
                        });
                    }
                }
            });

            if (!bestMove) break;

            bestMove.slotA.function = bestMove.fnB;
            bestMove.slotB.function = bestMove.fnA;
            staffFunctionCounts[bestMove.sidA][bestMove.fnA] = Math.max(
                0,
                this.normalizeNumber(staffFunctionCounts[bestMove.sidA][bestMove.fnA], 0) - 1
            );
            staffFunctionCounts[bestMove.sidA][bestMove.fnB] = this.normalizeNumber(
                staffFunctionCounts[bestMove.sidA][bestMove.fnB],
                0
            ) + 1;
            staffFunctionCounts[bestMove.sidB][bestMove.fnB] = Math.max(
                0,
                this.normalizeNumber(staffFunctionCounts[bestMove.sidB][bestMove.fnB], 0) - 1
            );
            staffFunctionCounts[bestMove.sidB][bestMove.fnA] = this.normalizeNumber(
                staffFunctionCounts[bestMove.sidB][bestMove.fnA],
                0
            ) + 1;

            majorL1Gain += this.normalizeNumber(bestMove.l1Gain, 0);
            swapCount += 1;
        }

        return {
            swapCount,
            majorL1Gain
        };
    },

    buildFunctionTargets(totalAssignments, baseline) {
        const targets = {};
        const totalBase = Object.values(baseline).reduce((sum, n) => sum + n, 0);
        const remainders = [];
        let assigned = 0;

        this.FUNCTION_TYPES.forEach((f) => {
            const ratio = totalBase > 0 ? (baseline[f] || 0) / totalBase : (1 / this.FUNCTION_TYPES.length);
            const raw = totalAssignments * ratio;
            const base = Math.floor(raw);
            targets[f] = base;
            assigned += base;
            remainders.push({ f, frac: raw - base });
        });

        remainders.sort((a, b) => b.frac - a.frac);
        let left = totalAssignments - assigned;
        let idx = 0;
        while (left > 0 && remainders.length > 0) {
            const pick = remainders[idx % remainders.length].f;
            targets[pick] += 1;
            left -= 1;
            idx += 1;
        }

        return targets;
    },

    buildStaffFunctionTargets(staffAssignmentCount, functionTargets, rng, options = {}) {
        const targets = {};
        const majorFunctionPersonalRatioEnabled = options.majorFunctionPersonalRatioEnabled !== false;
        const majorFunctions = ['网', '天', '微'];
        const balanceFunctions = this.BALANCE_FUNCTIONS.slice();
        const totalAssignments = this.FUNCTION_TYPES.reduce((sum, f) => sum + this.normalizeNumber(functionTargets[f], 0), 0);
        const majorTotal = majorFunctions.reduce((sum, f) => sum + this.normalizeNumber(functionTargets[f], 0), 0);
        const majorRatio = totalAssignments > 0 ? (majorTotal / totalAssignments) : 0.6;
        // 开关开启时：按最低人力基线比例分摊到个人；关闭时保留更平滑的历史口径。
        const majorWeightMap = {};
        let majorWeightSum = 0;
        majorFunctions.forEach((f) => {
            const baseWeight = Math.max(0, this.normalizeNumber(functionTargets[f], 0));
            const smoothedWeight = majorFunctionPersonalRatioEnabled
                ? baseWeight
                : Math.sqrt(baseWeight);
            majorWeightMap[f] = smoothedWeight;
            majorWeightSum += smoothedWeight;
        });
        const staffIds = Object.keys(staffAssignmentCount || {}).sort((a, b) => String(a).localeCompare(String(b)));

        staffIds.forEach((sid, staffIdx) => {
            const total = Math.max(0, Math.floor(this.normalizeNumber(staffAssignmentCount[sid], 0)));
            targets[sid] = {};
            this.FUNCTION_TYPES.forEach((f) => {
                targets[sid][f] = 0;
            });
            if (total <= 0) return;

            const majorCount = Math.max(0, Math.min(total, Math.round(total * majorRatio)));
            const balanceCount = Math.max(0, total - majorCount);

            const baseBalance = Math.floor(balanceCount / Math.max(1, balanceFunctions.length));
            const balanceRemainder = balanceCount - baseBalance * balanceFunctions.length;
            balanceFunctions.forEach((f, idx) => {
                targets[sid][f] = baseBalance + (idx < balanceRemainder ? 1 : 0);
            });

            const majorRemainders = [];
            let majorAssigned = 0;
            majorFunctions.forEach((f) => {
                const ratio = majorWeightSum > 0
                    ? (this.normalizeNumber(majorWeightMap[f], 0) / majorWeightSum)
                    : (1 / majorFunctions.length);
                const raw = majorCount * ratio;
                const base = Math.floor(raw);
                targets[sid][f] = base;
                majorAssigned += base;
                majorRemainders.push({ f, frac: raw - base });
            });

            majorRemainders.sort((a, b) => {
                if (b.frac !== a.frac) return b.frac - a.frac;
                return rng.random() - 0.5;
            });
            let left = majorCount - majorAssigned;
            let idx = staffIdx;
            while (left > 0 && majorRemainders.length > 0) {
                const pick = majorRemainders[idx % majorRemainders.length].f;
                targets[sid][pick] = this.normalizeNumber(targets[sid][pick], 0) + 1;
                left -= 1;
                idx += 1;
            }

            const totalCheck = this.FUNCTION_TYPES.reduce((sum, f) => sum + this.normalizeNumber(targets[sid][f], 0), 0);
            if (totalCheck < total) {
                targets[sid]['网'] = this.normalizeNumber(targets[sid]['网'], 0) + (total - totalCheck);
            }
        });

        return targets;
    },

    getStaffFunctionBalanceLimit(staffAssignmentCount, functionBalanceM) {
        const base = Math.max(0, Math.floor(this.normalizeNumber(functionBalanceM, 0)));
        const total = Math.max(0, Math.floor(this.normalizeNumber(staffAssignmentCount, 0)));
        if (total <= 0) return base;
        if (total <= 8) return Math.max(base, 3);
        if (total <= 12) return Math.max(base, 2);
        // 当月白班天数越多，六类职能的离散度会自然放大；阈值按工作量分段放宽，保留极端不均衡告警。
        if (total <= 16) return Math.max(base, base + 1);
        if (total <= 22) return Math.max(base, base + 2);
        return Math.max(base, base + 3);
    },

    getStaffMajorFunctionBalanceLimit(staffAssignmentCount) {
        const total = Math.max(0, Math.floor(this.normalizeNumber(staffAssignmentCount, 0)));
        if (total <= 0) return 2;
        if (total <= 6) return 2;
        if (total <= 12) return 3;
        if (total <= 18) return 4;
        return 5;
    },

    buildDailyFunctionTargets(dailyAssignmentCount, baseline, dailyFunctionMinima = null, dailyFunctionMinThreshold = 0) {
        const totalBase = Object.values(baseline || {}).reduce((sum, n) => sum + this.normalizeNumber(n, 0), 0);
        const dateTargets = {};

        Object.keys(dailyAssignmentCount || {}).forEach((date) => {
            const totalAssignments = this.normalizeNumber(dailyAssignmentCount[date], 0);
            const targets = {};
            const remainders = [];
            let assigned = 0;

            this.FUNCTION_TYPES.forEach((f) => {
                const ratio = totalBase > 0 ? this.normalizeNumber(baseline[f], 0) / totalBase : (1 / this.FUNCTION_TYPES.length);
                const raw = totalAssignments * ratio;
                const base = Math.floor(raw);
                targets[f] = base;
                assigned += base;
                remainders.push({ f, frac: raw - base });
            });

            remainders.sort((a, b) => b.frac - a.frac);
            let left = totalAssignments - assigned;
            let idx = 0;
            while (left > 0 && remainders.length > 0) {
                const pick = remainders[idx % remainders.length].f;
                targets[pick] += 1;
                left -= 1;
                idx += 1;
            }

            this.enforceDailyFunctionMinimums({
                targets,
                totalAssignments,
                dailyFunctionMinima,
                dailyFunctionMinThreshold
            });

            dateTargets[date] = targets;
        });

        return dateTargets;
    },

    enforceDailyFunctionMinimums(ctx) {
        const {
            targets = {},
            totalAssignments = 0,
            dailyFunctionMinima = null,
            dailyFunctionMinThreshold = 0
        } = ctx || {};

        const threshold = Math.max(0, Math.floor(this.normalizeNumber(dailyFunctionMinThreshold, 0)));
        if (this.normalizeNumber(totalAssignments, 0) < threshold) {
            return;
        }
        if (!dailyFunctionMinima || typeof dailyFunctionMinima !== 'object') {
            return;
        }

        const minima = {};
        this.FUNCTION_TYPES.forEach((f) => {
            const minV = Math.max(0, Math.floor(this.normalizeNumber(dailyFunctionMinima[f], 0)));
            if (minV > 0) minima[f] = minV;
        });
        if (Object.keys(minima).length === 0) return;

        // 借位补齐：从当前配额较高的职能挪给最低保障职能，总量不变
        Object.keys(minima).forEach((targetFn) => {
            const required = minima[targetFn];
            while ((targets[targetFn] || 0) < required) {
                const donor = this.FUNCTION_TYPES
                    .filter((f) => f !== targetFn)
                    .sort((a, b) => {
                        const va = this.normalizeNumber(targets[a], 0);
                        const vb = this.normalizeNumber(targets[b], 0);
                        return vb - va;
                    })
                    .find((f) => {
                        const curr = this.normalizeNumber(targets[f], 0);
                        const floor = this.normalizeNumber(minima[f], 0);
                        return curr > floor;
                    });

                if (!donor) break;
                targets[donor] = Math.max(0, this.normalizeNumber(targets[donor], 0) - 1);
                targets[targetFn] = this.normalizeNumber(targets[targetFn], 0) + 1;
            }
        });
    },

    buildYearlyFunctionDelta(staffFunctionCounts) {
        const delta = {};
        Object.entries(staffFunctionCounts).forEach(([sid, cnt]) => {
            delta[sid] = {};
            this.FUNCTION_TYPES.forEach((f) => {
                delta[sid][f] = cnt[f] || 0;
            });
        });
        return delta;
    },

    async persistYearlyFunctionDelta(staffList, yearlyDelta) {
        if (typeof Store === 'undefined' || typeof Store.updateStaffHistory !== 'function') {
            return;
        }

        let touched = 0;

        try {
            staffList.forEach((staff) => {
                const sid = this.normalizeStaffId(staff);
                const versionId = staff.versionId;
                if (!sid || !versionId) return;

                const curr = (staff.yearlyFunctionCounts && typeof staff.yearlyFunctionCounts === 'object')
                    ? staff.yearlyFunctionCounts
                    : {};

                const next = { ...curr };
                this.FUNCTION_TYPES.forEach((f) => {
                    const oldVal = this.normalizeNumber(next[f], 0);
                    const inc = this.normalizeNumber(yearlyDelta[sid]?.[f], 0);
                    next[f] = oldVal + inc;
                });

                Store.updateStaffHistory(sid, versionId, { yearlyFunctionCounts: next }, null, false);
                touched += 1;
            });

            if (touched > 0 && typeof Store.saveState === 'function') {
                await Store.saveState();
                console.log(`[CSPSolverV2] 已更新 ${touched} 人年度职能累计`);
            }
        } catch (error) {
            console.warn('[CSPSolverV2] 回写年度职能累计失败:', error);
        }
    },

    pickNextVacationToClear(ctx) {
        const { requestState, scoresByStaff, clearTrack, rng, shortageByDate = {} } = ctx;

        const clearableByStaff = {};
        Object.entries(requestState).forEach(([sid, req]) => {
            const days = Object.keys(req || {}).filter((dateStr) => {
                const t = req[dateStr];
                return t === 'ANNUAL' || t === 'LEGAL' || t === 'REQ';
            });
            if (days.length > 0) {
                clearableByStaff[sid] = days;
            }
        });

        const candidateStaff = Object.keys(clearableByStaff);
        if (candidateStaff.length === 0) return null;

        let roundMin = Infinity;
        candidateStaff.forEach((sid) => {
            const c = clearTrack[sid] || 0;
            if (c < roundMin) roundMin = c;
        });

        const roundCandidates = candidateStaff.filter((sid) => (clearTrack[sid] || 0) === roundMin);
        roundCandidates.sort((a, b) => {
            const sa = this.normalizeNumber(scoresByStaff[a], 0);
            const sb = this.normalizeNumber(scoresByStaff[b], 0);
            if (sb !== sa) return sb - sa;

            const ra = clearableByStaff[a].length;
            const rb = clearableByStaff[b].length;
            if (rb !== ra) return rb - ra;

            return rng.random() - 0.5;
        });

        const sid = roundCandidates[0];
        if (!sid) return null;

        const staffDays = clearableByStaff[sid].slice();
        staffDays.sort((x, y) => {
            const sx = this.sumShortageForDate(shortageByDate[x]);
            const sy = this.sumShortageForDate(shortageByDate[y]);
            if (sy !== sx) return sy - sx;
            const tx = requestState[sid] && requestState[sid][x];
            const ty = requestState[sid] && requestState[sid][y];
            const wx = tx === 'REQ' ? 2 : (tx === 'LEGAL' ? 1 : 0);
            const wy = ty === 'REQ' ? 2 : (ty === 'LEGAL' ? 1 : 0);
            if (wy !== wx) return wy - wx;
            return rng.random() - 0.5;
        });

        const dateStr = staffDays[0];
        if (!dateStr) return null;

        return {
            staffId: sid,
            dateStr,
            type: requestState[sid][dateStr] || 'UNKNOWN'
        };
    },

    sumShortageForDate(shortObj) {
        if (!shortObj || typeof shortObj !== 'object') return 0;
        return Object.values(shortObj).reduce((sum, n) => sum + this.normalizeNumber(n, 0), 0);
    },

    getDailyMinimumDemand(dateList) {
        const defaults = {
            A1: 2,
            A: 2,
            A2: 1,
            B1: 2,
            B2: 3
        };

        const demand = {};
        const config = (typeof Store !== 'undefined') ? (Store.getState('minimumManpowerConfig') || {}) : {};
        const daily = config.dailyDemand || {};

        dateList.forEach((date) => {
            const row = daily[date] || {};
            demand[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                const v = row[shift];
                demand[date][shift] = Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : defaults[shift];
            });
        });

        return demand;
    },

    buildTargetDays(staffList, dateList, restDays, requestState, nightMap) {
        const result = {};
        const totalDays = dateList.length;
        const restDayCount = dateList.filter((d) => restDays[d] === true).length;

        staffList.forEach((staff) => {
            const sid = staff._sid;

            // 若人员表显式给了应上白班天数，优先使用
            const directTarget =
                this.firstFinite([
                    staff.targetDayShiftDays,
                    staff.expectedDayShiftDays,
                    staff.dayShiftTarget,
                    staff.dayShiftDays,
                    staff.应上白班天数
                ]);

            if (directTarget != null) {
                result[sid] = Math.max(0, Math.floor(Number(directTarget)));
                return;
            }

            const req = requestState[sid] || {};
            let annualOnWorkday = 0;
            dateList.forEach((date) => {
                if (req[date] === 'ANNUAL' && restDays[date] !== true) {
                    annualOnWorkday += 1;
                }
            });

            const nightCount = Object.keys(nightMap[sid] || {}).length;
            const expected = Math.max(0, totalDays - restDayCount - annualOnWorkday - nightCount);
            result[sid] = expected;
        });

        return result;
    },

    applyPlannedExtraTargetDays(baseTargetDays, staffList, config) {
        const targetDays = { ...(baseTargetDays || {}) };
        const plannedExtraByStaff = {};
        const plan = (config && config.staffExtraAllowanceDays && typeof config.staffExtraAllowanceDays === 'object')
            ? config.staffExtraAllowanceDays
            : {};
        const enforceAsTarget = !!(config
            && config.useStaffExtraAllowanceOnly === true
            && config.enforcePlannedExtraAsTarget !== false);
        if (!enforceAsTarget) {
            return { targetDays, plannedExtraByStaff, plannedExtraTotal: 0 };
        }

        let plannedExtraTotal = 0;
        (staffList || []).forEach((staff) => {
            const sid = String(staff && staff._sid ? staff._sid : '').trim();
            if (!sid) return;
            const n = Number(plan[sid]);
            if (!Number.isFinite(n) || n <= 0) return;
            const extra = Math.max(0, Math.floor(n));
            if (extra <= 0) return;
            targetDays[sid] = Math.max(0, Math.floor(Number(targetDays[sid]) || 0) + extra);
            plannedExtraByStaff[sid] = extra;
            plannedExtraTotal += extra;
        });

        return {
            targetDays,
            plannedExtraByStaff,
            plannedExtraTotal
        };
    },

    buildTargetDayStats(staffIds, targetDays) {
        const values = (staffIds || [])
            .map((sid) => Math.max(0, Math.floor(this.normalizeNumber(targetDays?.[sid], 0))))
            .filter((n) => Number.isFinite(n));
        if (values.length === 0) {
            return {
                count: 0,
                avg: 0,
                std: 0,
                min: 0,
                max: 0
            };
        }
        const count = values.length;
        const sum = values.reduce((acc, n) => acc + n, 0);
        const avg = sum / count;
        const variance = values.reduce((acc, n) => {
            const d = n - avg;
            return acc + d * d;
        }, 0) / count;
        const std = Math.sqrt(Math.max(0, variance));
        return {
            count,
            avg,
            std,
            min: Math.min(...values),
            max: Math.max(...values)
        };
    },

    buildExtraFairnessProfile(staffIds, targetDays, config = {}) {
        const stats = this.buildTargetDayStats(staffIds, targetDays);
        const enabled = config?.extraByTargetAvgBiasEnabled !== false;
        const fallbackScale = Math.max(1, this.normalizeNumber(stats.std, 1));
        const scale = Math.max(1, this.normalizeNumber(config?.extraByTargetAvgScaleDays, fallbackScale));
        const byStaff = {};
        (staffIds || []).forEach((sid) => {
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays?.[sid], 0)));
            const raw = stats.avg - target; // >0: 低于均值，优先承担额外加班；<0: 高于均值，降低额外加班概率
            const normalized = raw / scale;
            byStaff[sid] = enabled ? Math.max(-2.5, Math.min(2.5, normalized)) : 0;
        });
        return {
            ...stats,
            enabled,
            scale,
            byStaff
        };
    },

    getExtraCandidateBiasScore(sid, actual, target, extraFairnessProfile, config = {}) {
        if (!extraFairnessProfile || extraFairnessProfile.enabled !== true) return 0;
        const actualN = this.normalizeNumber(actual, 0);
        const targetN = this.normalizeNumber(target, 0);
        // 仅针对“额外加班”(>=target)施加偏置，正常补齐目标不受影响
        if (actualN < targetN) return 0;
        const baseBias = this.normalizeNumber(extraFairnessProfile.byStaff?.[sid], 0);
        const scoreWeight = this.normalizeNumber(config?.extraByTargetAvgScoreWeight, 180);
        const overPenaltyWeight = this.normalizeNumber(config?.extraOverTargetLevelPenaltyWeight, 120);
        const overAfter = Math.max(0, (actualN + 1) - targetN);
        return baseBias * scoreWeight - overAfter * overPenaltyWeight;
    },

    buildExtraCapByStaff(staffList, targetDays, config = {}) {
        const maxExtraDefault = Math.max(0, Math.floor(this.normalizeNumber(config?.maxExtraDayPerStaff, 0)));
        const staffPlan = (config && config.staffExtraAllowanceDays && typeof config.staffExtraAllowanceDays === 'object')
            ? config.staffExtraAllowanceDays
            : {};
        const useStaffExtraOnly = config && config.useStaffExtraAllowanceOnly === true;
        const enforcePlannedExtraAsTarget = !!(useStaffExtraOnly && config && config.enforcePlannedExtraAsTarget !== false);
        const staffIds = (staffList || []).map((s) => s?._sid).filter(Boolean);
        const fairnessProfile = this.buildExtraFairnessProfile(staffIds, targetDays, config);
        const reduceStepDays = Math.max(1, Math.floor(this.normalizeNumber(config?.extraCapHighTargetReduceStepDays, 2)));
        const reducePerStep = Math.max(0, Math.floor(this.normalizeNumber(config?.extraCapHighTargetReducePerStep, 1)));
        const out = {};

        (staffList || []).forEach((staff) => {
            const sid = staff && staff._sid ? staff._sid : '';
            if (!sid) return;
            const explicit = this.normalizeNumber(staffPlan[sid], NaN);
            const hasExplicit = Number.isFinite(explicit);
            let cap = 0;
            if (hasExplicit) {
                cap = enforcePlannedExtraAsTarget ? 0 : Math.max(0, Math.floor(explicit));
            } else {
                cap = useStaffExtraOnly ? 0 : maxExtraDefault;
            }

            // 未配置显式个人白名单时，默认按“目标天数高于均值 -> 收紧额外cap”处理
            if (!hasExplicit && fairnessProfile.enabled === true && cap > 0) {
                const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays?.[sid], 0)));
                const overAvg = Math.max(0, target - fairnessProfile.avg);
                const reduceSteps = Math.floor(overAvg / reduceStepDays);
                const reduce = Math.max(0, reduceSteps * reducePerStep);
                if (reduce > 0) {
                    cap = Math.max(0, cap - reduce);
                }
            }
            out[sid] = cap;
        });

        return out;
    },

    normalizeRequestState(personalRequests, staffList, dateList) {
        const state = {};
        const dateSet = new Set(dateList);

        staffList.forEach((s) => {
            const sid = s._sid;
            state[sid] = {};
            const req = personalRequests[sid] || personalRequests[String(sid)] || {};
            Object.entries(req || {}).forEach(([date, status]) => {
                if (!dateSet.has(date)) return;
                if (!status) return;
                state[sid][date] = status;
            });
        });

        return state;
    },

    normalizeNightSchedule(nightSchedule, staffList, dateList) {
        const map = {};
        const dateSet = new Set(dateList);

        staffList.forEach((s) => {
            map[s._sid] = {};
            const sid = s._sid;
            const row = nightSchedule[sid] || nightSchedule[String(sid)] || {};

            Object.entries(row || {}).forEach(([date, shift]) => {
                if (!dateSet.has(date)) return;
                if (shift == null || shift === '') return;
                map[sid][date] = true;
            });
        });

        return map;
    },

    computeShiftCoverageShortage(ctx) {
        const { assignment, dateList, requestState, nightMap, dailyMinDemand, staffIds } = ctx;
        let total = 0;
        const top = [];

        dateList.forEach((date) => {
            this.SHIFT_TYPES.forEach((shift) => {
                const need = dailyMinDemand[date]?.[shift] || 0;
                if (need <= 0) return;

                const avail = this.countAvailableByShiftOnDate({
                    assignment,
                    shift,
                    date,
                    requestState,
                    nightMap,
                    staffIds
                });

                if (avail < need) {
                    const gap = need - avail;
                    total += gap;
                    top.push({ date, shift, gap });
                }
            });
        });

        top.sort((a, b) => b.gap - a.gap);
        return { total, top };
    },

    countAvailableByShiftOnDate(ctx) {
        const { assignment, shift, date, requestState, nightMap, staffIds } = ctx;
        let n = 0;
        for (let i = 0; i < staffIds.length; i++) {
            const sid = staffIds[i];
            if (assignment[sid] !== shift) continue;
            if (this.isHardBlocked(sid, date, requestState, nightMap)) continue;
            n += 1;
        }
        return n;
    },

    isHardBlocked(sid, date, requestState, nightMap) {
        if (nightMap[sid] && nightMap[sid][date]) return true;
        const t = requestState[sid] && requestState[sid][date];
        if (!t) return false;
        return t === 'REQ' || t === 'REST' || t === 'ANNUAL' || t === 'LEGAL' || t === 'SICK';
    },

    willBreakMaxWork(assignedSet, dateList, dIdx, maxWork, fixedWorkSet = new Set()) {
        const date = dateList[dIdx];

        let left = 0;
        for (let i = dIdx - 1; i >= 0; i--) {
            if (!assignedSet.has(dateList[i]) && !fixedWorkSet.has(dateList[i])) break;
            left += 1;
        }

        let right = 0;
        for (let i = dIdx + 1; i < dateList.length; i++) {
            if (!assignedSet.has(dateList[i]) && !fixedWorkSet.has(dateList[i])) break;
            right += 1;
        }

        const total = left + 1 + right;
        return total > maxWork;
    },

    extractRuns(datesObj, dateList, fixedWorkSet = new Set()) {
        const workRuns = [];
        const restRuns = [];

        let currType = null;
        let len = 0;

        dateList.forEach((date, idx) => {
            const isWork = !!datesObj[date] || fixedWorkSet.has(date);
            const t = isWork ? 'W' : 'R';

            if (idx === 0) {
                currType = t;
                len = 1;
                return;
            }

            if (t === currType) {
                len += 1;
            } else {
                if (currType === 'W') workRuns.push(len);
                else restRuns.push(len);
                currType = t;
                len = 1;
            }
        });

        if (len > 0) {
            if (currType === 'W') workRuns.push(len);
            else restRuns.push(len);
        }

        return { workRuns, restRuns };
    },

    extractRunSegmentsFromSet(assignedSet, dateList, fixedWorkSet = new Set()) {
        const workRuns = [];
        const restRuns = [];
        const segments = [];

        let currType = null;
        let len = 0;
        let startIdx = 0;

        const flush = (endIdxExclusive) => {
            if (!currType || len <= 0) return;
            const seg = {
                type: currType,
                len,
                startIdx,
                endIdx: endIdxExclusive - 1
            };
            segments.push(seg);
            if (currType === 'W') workRuns.push(len);
            else restRuns.push(len);
        };

        dateList.forEach((date, idx) => {
            const isWork = assignedSet.has(date) || fixedWorkSet.has(date);
            const type = isWork ? 'W' : 'R';

            if (idx === 0) {
                currType = type;
                len = 1;
                startIdx = 0;
                return;
            }

            if (type === currType) {
                len += 1;
                return;
            }

            flush(idx);
            currType = type;
            len = 1;
            startIdx = idx;
        });

        flush(dateList.length);
        return { workRuns, restRuns, segments };
    },

    getContinuityMetricsFromSet(assignedSet, dateList, relax, fixedWorkSet = new Set()) {
        const runInfo = this.extractRunSegmentsFromSet(assignedSet, dateList, fixedWorkSet);
        let maxWorkOver = 0;
        let maxRestOver = 0;
        let minWorkUnder = 0;
        let minRestUnder = 0;

        runInfo.segments.forEach((seg) => {
            if (seg.type === 'W') {
                if (seg.len > relax.maxWork) maxWorkOver += (seg.len - relax.maxWork);
                if (seg.len < relax.minWork) minWorkUnder += (relax.minWork - seg.len);
            } else {
                if (seg.len > relax.maxRest) maxRestOver += (seg.len - relax.maxRest);
                if (seg.len < relax.minRest) minRestUnder += (relax.minRest - seg.len);
            }
        });

        return {
            maxWorkOver,
            maxRestOver,
            minWorkUnder,
            minRestUnder,
            overTotal: maxWorkOver + maxRestOver,
            softTotal: minWorkUnder + minRestUnder,
            runInfo
        };
    },

    continuityPairScore(metricsA, metricsB) {
        return (
            (metricsA.overTotal + metricsB.overTotal) * 100 +
            (metricsA.softTotal + metricsB.softTotal)
        );
    },

    buildCenteredIndices(startIdx, endIdx) {
        const out = [];
        const center = Math.floor((startIdx + endIdx) / 2);
        let left = center;
        let right = center + 1;
        while (left >= startIdx || right <= endIdx) {
            if (left >= startIdx) out.push(left);
            if (right <= endIdx) out.push(right);
            left -= 1;
            right += 1;
        }
        return out;
    },

    repairLongRestByExtraDays(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            assignedSet,
            fixedWorkSet,
            monthlyShiftAssignments,
            requestState,
            nightMap,
            dailyMinDemand,
            assignedCountByDateShift,
            remaining,
            extraUsed,
            extraCapByStaff = {},
            relax,
            rng
        } = ctx;

        let addedCount = 0;

        for (let pass = 0; pass < 2; pass++) {
            let changed = false;

            const priorities = staffIds.map((sid) => {
                const metrics = this.getContinuityMetricsFromSet(
                    assignedSet[sid],
                    dateList,
                    relax,
                    fixedWorkSet[sid]
                );
                return { sid, restOver: metrics.maxRestOver, metrics };
            }).filter((x) => x.restOver > 0)
                .sort((a, b) => b.restOver - a.restOver);

            if (priorities.length === 0) break;

            for (let p = 0; p < priorities.length; p++) {
                const sid = priorities[p].sid;
                const shift = monthlyShiftAssignments[sid];
                if (!shift) continue;

                while (extraUsed[sid] < this.normalizeNumber(extraCapByStaff[sid], 0) || remaining[sid] > 0) {
                    const before = this.getContinuityMetricsFromSet(
                        assignedSet[sid],
                        dateList,
                        relax,
                        fixedWorkSet[sid]
                    );
                    if (before.maxRestOver <= 0) break;

                    const longRestSegments = before.runInfo.segments
                        .filter((seg) => seg.type === 'R' && seg.len > relax.maxRest)
                        .sort((a, b) => b.len - a.len);
                    if (longRestSegments.length === 0) break;

                    let bestDate = null;
                    let bestScore = -Infinity;

                    for (let sIdx = 0; sIdx < longRestSegments.length; sIdx++) {
                        const seg = longRestSegments[sIdx];
                        const candidateIdxs = this.buildCenteredIndices(seg.startIdx, seg.endIdx);

                        for (let cIdx = 0; cIdx < candidateIdxs.length; cIdx++) {
                            const i = candidateIdxs[cIdx];
                            const date = dateList[i];
                            if (!date) continue;
                            if (assignedSet[sid].has(date)) continue;
                            if (this.isHardBlocked(sid, date, requestState, nightMap)) continue;
                            if (this.willBreakMaxWork(assignedSet[sid], dateList, i, relax.maxWork, fixedWorkSet[sid])) continue;

                            const afterSet = new Set(assignedSet[sid]);
                            afterSet.add(date);
                            const after = this.getContinuityMetricsFromSet(
                                afterSet,
                                dateList,
                                relax,
                                fixedWorkSet[sid]
                            );

                            const improveRestOver = before.maxRestOver - after.maxRestOver;
                            const improveSoft = before.softTotal - after.softTotal;
                            if (improveRestOver <= 0 && improveSoft <= 0) continue;

                            const need = this.normalizeNumber(dailyMinDemand[date]?.[shift], 0);
                            const actual = this.normalizeNumber(assignedCountByDateShift[date]?.[shift], 0);
                            const shortageBoost = Math.max(0, need - actual);
                            const score = improveRestOver * 100 + improveSoft * 8 + shortageBoost * 30 + rng.random();

                            if (score > bestScore) {
                                bestScore = score;
                                bestDate = date;
                            }
                        }
                    }

                    if (!bestDate) break;

                    assignedSet[sid].add(bestDate);
                    scheduleByStaff[sid][bestDate] = shift;
                    if (remaining[sid] > 0) {
                        remaining[sid] -= 1;
                    } else {
                        extraUsed[sid] += 1;
                    }
                    if (assignedCountByDateShift[bestDate] && assignedCountByDateShift[bestDate][shift] != null) {
                        assignedCountByDateShift[bestDate][shift] += 1;
                    }

                    addedCount += 1;
                    changed = true;
                }
            }

            if (!changed) break;
        }

        const residualRestOver = staffIds.reduce((sum, sid) => {
            const m = this.getContinuityMetricsFromSet(
                assignedSet[sid],
                dateList,
                relax,
                fixedWorkSet[sid]
            );
            return sum + m.maxRestOver;
        }, 0);

        return { addedCount, residualRestOver };
    },

    repairContinuityBySwaps(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            assignedSet,
            fixedWorkSet,
            monthlyShiftAssignments,
            requestState,
            nightMap,
            relax,
            rng,
            maxSwapSteps = 200,
            trace = false,
            watchDateSet = new Set(),
            traceLabel = ''
        } = ctx;

        const staffByShift = {};
        this.SHIFT_TYPES.forEach((s) => { staffByShift[s] = []; });
        staffIds.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            if (shift && staffByShift[shift]) staffByShift[shift].push(sid);
        });

        let swapCount = 0;

        for (let step = 0; step < maxSwapSteps; step++) {
            const offenderList = staffIds.map((sid) => {
                const metrics = this.getContinuityMetricsFromSet(
                    assignedSet[sid],
                    dateList,
                    relax,
                    fixedWorkSet[sid]
                );
                return {
                    sid,
                    shift: monthlyShiftAssignments[sid],
                    metrics
                };
            }).filter((x) => x.metrics.overTotal > 0);

            if (offenderList.length === 0) break;

            offenderList.sort((a, b) => {
                if (b.metrics.overTotal !== a.metrics.overTotal) return b.metrics.overTotal - a.metrics.overTotal;
                return b.metrics.softTotal - a.metrics.softTotal;
            });

            let applied = false;

            for (let oIdx = 0; oIdx < offenderList.length && !applied; oIdx++) {
                const offender = offenderList[oIdx];
                const sid = offender.sid;
                const shift = offender.shift;
                if (!shift || !staffByShift[shift] || staffByShift[shift].length < 2) continue;

                const badSegments = offender.metrics.runInfo.segments
                    .filter((seg) =>
                        (seg.type === 'R' && seg.len > relax.maxRest) ||
                        (seg.type === 'W' && seg.len > relax.maxWork)
                    )
                    .sort((a, b) => b.len - a.len);

                for (let sIdx = 0; sIdx < badSegments.length && !applied; sIdx++) {
                    const seg = badSegments[sIdx];
                    const donorPool = staffByShift[shift].filter((x) => x !== sid);
                    donorPool.sort(() => rng.random() - 0.5);

                    const candidateIdxs = this.buildCenteredIndices(seg.startIdx, seg.endIdx);
                    let bestMove = null;

                    for (let cIdx = 0; cIdx < candidateIdxs.length; cIdx++) {
                        const i1 = candidateIdxs[cIdx];
                        const d1 = dateList[i1];

                        const sidHasAtD1 = assignedSet[sid].has(d1);
                        const sidNeedWorkAtD1 = seg.type === 'R';
                        if (sidNeedWorkAtD1 && sidHasAtD1) continue;
                        if (!sidNeedWorkAtD1 && !sidHasAtD1) continue;
                        if (sidNeedWorkAtD1 && this.isHardBlocked(sid, d1, requestState, nightMap)) continue;
                        if (sidNeedWorkAtD1 && this.willBreakMaxWork(assignedSet[sid], dateList, i1, relax.maxWork, fixedWorkSet[sid])) continue;

                        for (let dIdx = 0; dIdx < donorPool.length; dIdx++) {
                            const donor = donorPool[dIdx];
                            const donorHasAtD1 = assignedSet[donor].has(d1);
                            if (sidNeedWorkAtD1 && !donorHasAtD1) continue;
                            if (!sidNeedWorkAtD1 && donorHasAtD1) continue;

                            const donorDates = Array.from(assignedSet[donor]);
                            donorDates.sort(() => rng.random() - 0.5);

                            const sidDates = Array.from(assignedSet[sid]);
                            sidDates.sort(() => rng.random() - 0.5);

                            const sidGiveDates = sidNeedWorkAtD1 ? sidDates : donorDates;
                            for (let gIdx = 0; gIdx < sidGiveDates.length; gIdx++) {
                                const d2 = sidGiveDates[gIdx];
                                const i2 = dateList.indexOf(d2);
                                if (i2 < 0 || d2 === d1) continue;

                                const sidHasAtD2 = assignedSet[sid].has(d2);
                                const donorHasAtD2 = assignedSet[donor].has(d2);

                                if (sidNeedWorkAtD1) {
                                    // sid: off->on at d1, on->off at d2 ; donor 反向
                                    if (!sidHasAtD2 || donorHasAtD2) continue;
                                    if (this.isHardBlocked(donor, d2, requestState, nightMap)) continue;
                                    if (this.willBreakMaxWork(assignedSet[donor], dateList, i2, relax.maxWork, fixedWorkSet[donor])) continue;
                                } else {
                                    // sid: on->off at d1, off->on at d2 ; donor 反向
                                    if (sidHasAtD2 || !donorHasAtD2) continue;
                                    if (this.isHardBlocked(sid, d2, requestState, nightMap)) continue;
                                    if (this.willBreakMaxWork(assignedSet[sid], dateList, i2, relax.maxWork, fixedWorkSet[sid])) continue;
                                    if (this.isHardBlocked(donor, d1, requestState, nightMap)) continue;
                                    if (this.willBreakMaxWork(assignedSet[donor], dateList, i1, relax.maxWork, fixedWorkSet[donor])) continue;
                                }

                                const sidBefore = this.getContinuityMetricsFromSet(assignedSet[sid], dateList, relax, fixedWorkSet[sid]);
                                const donorBefore = this.getContinuityMetricsFromSet(assignedSet[donor], dateList, relax, fixedWorkSet[donor]);
                                const beforeScore = this.continuityPairScore(sidBefore, donorBefore);

                                const sidAfterSet = new Set(assignedSet[sid]);
                                const donorAfterSet = new Set(assignedSet[donor]);
                                if (sidNeedWorkAtD1) {
                                    sidAfterSet.add(d1);
                                    sidAfterSet.delete(d2);
                                    donorAfterSet.delete(d1);
                                    donorAfterSet.add(d2);
                                } else {
                                    sidAfterSet.delete(d1);
                                    sidAfterSet.add(d2);
                                    donorAfterSet.add(d1);
                                    donorAfterSet.delete(d2);
                                }

                                const sidAfter = this.getContinuityMetricsFromSet(sidAfterSet, dateList, relax, fixedWorkSet[sid]);
                                const donorAfter = this.getContinuityMetricsFromSet(donorAfterSet, dateList, relax, fixedWorkSet[donor]);
                                const afterScore = this.continuityPairScore(sidAfter, donorAfter);
                                const improve = beforeScore - afterScore;

                                if (improve <= 0) continue;
                                if (!bestMove || improve > bestMove.improve) {
                                    bestMove = {
                                        sid,
                                        donor,
                                        d1,
                                        d2,
                                        sidNeedWorkAtD1,
                                        improve
                                    };
                                }
                            }
                        }
                    }

                    if (!bestMove) continue;

                    const sidShift = monthlyShiftAssignments[sid];
                    if (bestMove.sidNeedWorkAtD1) {
                        assignedSet[sid].add(bestMove.d1);
                        assignedSet[sid].delete(bestMove.d2);
                        assignedSet[bestMove.donor].delete(bestMove.d1);
                        assignedSet[bestMove.donor].add(bestMove.d2);

                        scheduleByStaff[sid][bestMove.d1] = sidShift;
                        delete scheduleByStaff[sid][bestMove.d2];
                        delete scheduleByStaff[bestMove.donor][bestMove.d1];
                        scheduleByStaff[bestMove.donor][bestMove.d2] = sidShift;
                    } else {
                        assignedSet[sid].delete(bestMove.d1);
                        assignedSet[sid].add(bestMove.d2);
                        assignedSet[bestMove.donor].add(bestMove.d1);
                        assignedSet[bestMove.donor].delete(bestMove.d2);

                        delete scheduleByStaff[sid][bestMove.d1];
                        scheduleByStaff[sid][bestMove.d2] = sidShift;
                        scheduleByStaff[bestMove.donor][bestMove.d1] = sidShift;
                        delete scheduleByStaff[bestMove.donor][bestMove.d2];
                    }

                    swapCount += 1;
                    applied = true;

                    if (trace && (watchDateSet.has(bestMove.d1) || watchDateSet.has(bestMove.d2))) {
                        console.log(
                            `[CSPSolverV2][Trace:${traceLabel}] 连续性换日: sid=${sid}, donor=${bestMove.donor}, d1=${bestMove.d1}, d2=${bestMove.d2}, improve=${bestMove.improve}`
                        );
                    }
                }
            }

            if (!applied) break;
        }

        const residualOver = staffIds.reduce((sum, sid) => {
            const metrics = this.getContinuityMetricsFromSet(
                assignedSet[sid],
                dateList,
                relax,
                fixedWorkSet[sid]
            );
            return sum + metrics.overTotal;
        }, 0);

        return { swapCount, residualOver };
    },

    repairStaffWorkdayFairnessByShiftTransfers(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand = {},
            relax,
            rng,
            maxTransferSteps = 240
        } = ctx;

        const assignedSet = {};
        const fixedWorkSet = {};
        const actualByStaff = {};
        const staffByShift = {};
        const dailyCount = {};
        let transferCount = 0;
        let fairnessGain = 0;

        dateList.forEach((date) => {
            dailyCount[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                dailyCount[date][shift] = 0;
            });
        });
        this.SHIFT_TYPES.forEach((shift) => { staffByShift[shift] = []; });
        staffIds.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            assignedSet[sid] = new Set(Object.keys(scheduleByStaff[sid] || {}));
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
            actualByStaff[sid] = assignedSet[sid].size;
            if (shift && staffByShift[shift]) staffByShift[shift].push(sid);
            assignedSet[sid].forEach((date) => {
                if (dailyCount[date] && dailyCount[date][shift] != null) {
                    dailyCount[date][shift] += 1;
                }
            });
        });

        const squareGap = (gap) => {
            const g = this.normalizeNumber(gap, 0);
            return g * g;
        };

        for (let step = 0; step < maxTransferSteps; step++) {
            let bestMove = null;

            this.SHIFT_TYPES.forEach((shift) => {
                const pool = staffByShift[shift] || [];
                if (pool.length < 2) return;

                const receivers = pool
                    .map((sid) => ({
                        sid,
                        gap: this.normalizeNumber(targetDays[sid], 0) - this.normalizeNumber(actualByStaff[sid], 0)
                    }))
                    .filter((x) => x.gap > 0)
                    .sort((a, b) => b.gap - a.gap);

                if (receivers.length === 0) return;

                for (let rIdx = 0; rIdx < receivers.length; rIdx++) {
                    const receiver = receivers[rIdx];
                    const sid = receiver.sid;
                    const receiverGap = receiver.gap;
                    const receiverBefore = this.getContinuityMetricsFromSet(
                        assignedSet[sid],
                        dateList,
                        relax,
                        fixedWorkSet[sid]
                    );

                    const donors = pool
                        .map((donorSid) => ({
                            sid: donorSid,
                            gap: this.normalizeNumber(targetDays[donorSid], 0) - this.normalizeNumber(actualByStaff[donorSid], 0)
                        }))
                        .filter((x) => x.sid !== sid && x.gap < receiverGap)
                        .sort((a, b) => a.gap - b.gap);

                    for (let dIdx = 0; dIdx < donors.length; dIdx++) {
                        const donor = donors[dIdx];
                        const donorSid = donor.sid;
                        const donorGap = donor.gap;
                        const donorBefore = this.getContinuityMetricsFromSet(
                            assignedSet[donorSid],
                            dateList,
                            relax,
                            fixedWorkSet[donorSid]
                        );

                        const donorDates = Array.from(assignedSet[donorSid]);
                        donorDates.sort((a, b) => String(a).localeCompare(String(b)));
                        for (let i = 0; i < donorDates.length; i++) {
                            const date = donorDates[i];
                            const dPos = dateList.indexOf(date);
                            if (dPos < 0) continue;
                            if (assignedSet[sid].has(date)) continue;
                            const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                            const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                            if ((actual - 1) < need) continue;
                            if (this.isHardBlocked(sid, date, requestState, nightMap)) continue;
                            if (this.willBreakMaxWork(assignedSet[sid], dateList, dPos, relax.maxWork, fixedWorkSet[sid])) continue;

                            const beforeFair = squareGap(receiverGap) + squareGap(donorGap);
                            const afterFair = squareGap(receiverGap - 1) + squareGap(donorGap + 1);
                            const fairImprove = beforeFair - afterFair;
                            if (fairImprove <= 0) continue;

                            const receiverAfterSet = new Set(assignedSet[sid]);
                            receiverAfterSet.add(date);
                            const donorAfterSet = new Set(assignedSet[donorSid]);
                            donorAfterSet.delete(date);

                            const receiverAfter = this.getContinuityMetricsFromSet(
                                receiverAfterSet,
                                dateList,
                                relax,
                                fixedWorkSet[sid]
                            );
                            const donorAfter = this.getContinuityMetricsFromSet(
                                donorAfterSet,
                                dateList,
                                relax,
                                fixedWorkSet[donorSid]
                            );

                            const continuityDelta =
                                this.continuityPairScore(receiverBefore, donorBefore)
                                - this.continuityPairScore(receiverAfter, donorAfter);
                            const score = fairImprove * 100 + continuityDelta * 8 + rng.random();

                            if (!bestMove || score > bestMove.score) {
                                bestMove = {
                                    shift,
                                    receiverSid: sid,
                                    donorSid,
                                    date,
                                    fairImprove,
                                    score
                                };
                            }
                        }
                    }
                }
            });

            if (!bestMove) break;

            assignedSet[bestMove.receiverSid].add(bestMove.date);
            assignedSet[bestMove.donorSid].delete(bestMove.date);
            scheduleByStaff[bestMove.receiverSid][bestMove.date] = bestMove.shift;
            delete scheduleByStaff[bestMove.donorSid][bestMove.date];
            actualByStaff[bestMove.receiverSid] = this.normalizeNumber(actualByStaff[bestMove.receiverSid], 0) + 1;
            actualByStaff[bestMove.donorSid] = Math.max(0, this.normalizeNumber(actualByStaff[bestMove.donorSid], 0) - 1);
            transferCount += 1;
            fairnessGain += bestMove.fairImprove;
        }

        return { transferCount, fairnessGain };
    },

    repairPreferredLongestRestByMoves(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            assignedSet,
            fixedWorkSet,
            monthlyShiftAssignments,
            requestState,
            nightMap,
            dailyMinDemand,
            assignedCountByDateShift,
            relax,
            rng,
            preferredLongestRestDays = 4,
            maxRepairSteps = 120
        } = ctx;

        const targetRestLen = Math.max(1, Math.floor(this.normalizeNumber(preferredLongestRestDays, 4)));
        if (targetRestLen <= 1) {
            return { moveCount: 0, improvedStaffCount: 0 };
        }

        // 仅在“每日最低人力已满足”前提下做连休软优化，不把它当硬约束。
        const dailyShortageTotal = dateList.reduce((sum, date) => {
            const dayNeed = dailyMinDemand?.[date] || {};
            const dayActual = assignedCountByDateShift?.[date] || {};
            return sum + this.SHIFT_TYPES.reduce((acc, shift) => {
                const need = this.normalizeNumber(dayNeed[shift], 0);
                const actual = this.normalizeNumber(dayActual[shift], 0);
                return acc + Math.max(0, need - actual);
            }, 0);
        }, 0);
        if (dailyShortageTotal > 0) {
            return { moveCount: 0, improvedStaffCount: 0, skippedByShortage: true };
        }

        const calcMaxRestRun = (sid) => {
            const runs = this.extractRuns(
                scheduleByStaff[sid] || {},
                dateList,
                fixedWorkSet[sid] || new Set()
            );
            return runs.restRuns.length > 0 ? Math.max(...runs.restRuns) : 0;
        };
        const improvedStaff = new Set();
        let moveCount = 0;

        for (let step = 0; step < maxRepairSteps; step++) {
            const candidates = staffIds
                .map((sid) => ({
                    sid,
                    shift: monthlyShiftAssignments[sid],
                    maxRest: calcMaxRestRun(sid)
                }))
                .filter((x) => x.shift && x.maxRest < targetRestLen)
                .sort((a, b) => a.maxRest - b.maxRest);
            if (candidates.length === 0) break;

            let bestMove = null;

            for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
                const { sid, shift, maxRest } = candidates[cIdx];
                const currentSet = assignedSet[sid] || new Set();
                const workDates = Array.from(currentSet);
                workDates.sort((a, b) => String(a).localeCompare(String(b)));

                for (let i = 0; i < workDates.length; i++) {
                    const fromDate = workDates[i];
                    const fromIdx = dateList.indexOf(fromDate);
                    if (fromIdx < 0) continue;
                    if ((fixedWorkSet[sid] || new Set()).has(fromDate)) continue;

                    const needFrom = this.normalizeNumber(dailyMinDemand[fromDate]?.[shift], 0);
                    const actualFrom = this.normalizeNumber(assignedCountByDateShift[fromDate]?.[shift], 0);
                    if (actualFrom <= needFrom) continue;

                    const removedSet = new Set(currentSet);
                    removedSet.delete(fromDate);
                    const beforeMetrics = this.getContinuityMetricsFromSet(
                        currentSet,
                        dateList,
                        relax,
                        fixedWorkSet[sid]
                    );

                    for (let dIdx = 0; dIdx < dateList.length; dIdx++) {
                        const toDate = dateList[dIdx];
                        if (toDate === fromDate) continue;
                        if (removedSet.has(toDate)) continue;
                        if (this.isHardBlocked(sid, toDate, requestState, nightMap)) continue;
                        if (this.willBreakMaxWork(removedSet, dateList, dIdx, relax.maxWork, fixedWorkSet[sid])) continue;

                        const afterSet = new Set(removedSet);
                        afterSet.add(toDate);
                        const afterMetrics = this.getContinuityMetricsFromSet(
                            afterSet,
                            dateList,
                            relax,
                            fixedWorkSet[sid]
                        );
                        const afterMaxRest = (() => {
                            const rr = afterMetrics?.runInfo?.restRuns || [];
                            return rr.length > 0 ? Math.max(...rr) : 0;
                        })();
                        if (afterMaxRest < maxRest) continue;
                        if (afterMetrics.maxRestOver > beforeMetrics.maxRestOver + 1) continue;

                        const beforeSoft = this.continuityPairScore(beforeMetrics, { overTotal: 0, softTotal: 0 });
                        const afterSoft = this.continuityPairScore(afterMetrics, { overTotal: 0, softTotal: 0 });
                        const restGain = afterMaxRest - maxRest;
                        const score = restGain * 220 + (beforeSoft - afterSoft) * 8 + rng.random();
                        if (!bestMove || score > bestMove.score) {
                            bestMove = {
                                sid,
                                shift,
                                fromDate,
                                toDate,
                                score,
                                beforeMaxRest: maxRest,
                                afterMaxRest
                            };
                        }
                    }
                }
            }

            if (!bestMove) break;

            const sid = bestMove.sid;
            assignedSet[sid].delete(bestMove.fromDate);
            assignedSet[sid].add(bestMove.toDate);
            delete scheduleByStaff[sid][bestMove.fromDate];
            scheduleByStaff[sid][bestMove.toDate] = bestMove.shift;

            if (assignedCountByDateShift[bestMove.fromDate] && assignedCountByDateShift[bestMove.fromDate][bestMove.shift] != null) {
                assignedCountByDateShift[bestMove.fromDate][bestMove.shift] = Math.max(
                    0,
                    this.normalizeNumber(assignedCountByDateShift[bestMove.fromDate][bestMove.shift], 0) - 1
                );
            }
            if (assignedCountByDateShift[bestMove.toDate] && assignedCountByDateShift[bestMove.toDate][bestMove.shift] != null) {
                assignedCountByDateShift[bestMove.toDate][bestMove.shift] = this.normalizeNumber(
                    assignedCountByDateShift[bestMove.toDate][bestMove.shift],
                    0
                ) + 1;
            }

            moveCount += 1;
            if (bestMove.afterMaxRest > bestMove.beforeMaxRest) {
                improvedStaff.add(sid);
            }
        }

        return {
            moveCount,
            improvedStaffCount: improvedStaff.size
        };
    },

    repairDailyShortageByShiftAddsAndMoves(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            extraCapByStaff = {},
            config = {},
            allowEmergencyOverTarget = false,
            maxEmergencyExtraDayPerStaff = 0,
            allowBreakMaxWorkOnEmergency = false,
            maxRepairSteps = 240
        } = ctx;

        const assignedSet = {};
        const fixedWorkSet = {};
        const actualByStaff = {};
        const staffByShift = {};
        const dailyCount = {};
        const extraFairnessProfile = this.buildExtraFairnessProfile(staffIds, targetDays, config);
        let addCount = 0;
        let moveCount = 0;
        let shortageReduced = 0;

        this.SHIFT_TYPES.forEach((shift) => { staffByShift[shift] = []; });
        dateList.forEach((date) => {
            dailyCount[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                dailyCount[date][shift] = 0;
            });
        });

        staffIds.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            assignedSet[sid] = new Set(Object.keys(scheduleByStaff[sid] || {}));
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
            actualByStaff[sid] = assignedSet[sid].size;
            if (shift && staffByShift[shift]) staffByShift[shift].push(sid);
            assignedSet[sid].forEach((date) => {
                if (dailyCount[date] && dailyCount[date][shift] != null) {
                    dailyCount[date][shift] += 1;
                }
            });
        });

        const buildShortages = () => {
            const out = [];
            dateList.forEach((date) => {
                this.SHIFT_TYPES.forEach((shift) => {
                    const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                    const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                    if (actual < need) {
                        out.push({
                            date,
                            shift,
                            gap: need - actual,
                            actual,
                            need
                        });
                    }
                });
            });
            out.sort((a, b) => {
                if (b.gap !== a.gap) return b.gap - a.gap;
                return String(a.date).localeCompare(String(b.date));
            });
            return out;
        };

        const buildMoveOutCandidate = (sid, shift, shortageDate) => {
            const beforeMetrics = this.getContinuityMetricsFromSet(
                assignedSet[sid],
                dateList,
                relax,
                fixedWorkSet[sid]
            );
            const beforeScore = this.continuityPairScore(beforeMetrics, { overTotal: 0, softTotal: 0 });
            let best = null;
            Array.from(assignedSet[sid] || []).forEach((date) => {
                if (date === shortageDate) return;
                const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                if (actual <= need) return;

                const afterSet = new Set(assignedSet[sid]);
                afterSet.delete(date);
                afterSet.add(shortageDate);
                const afterMetrics = this.getContinuityMetricsFromSet(
                    afterSet,
                    dateList,
                    relax,
                    fixedWorkSet[sid]
                );
                const afterScore = this.continuityPairScore(afterMetrics, { overTotal: 0, softTotal: 0 });
                const continuityImprove = beforeScore - afterScore;
                const surplus = actual - need;
                const score = surplus * 180 + continuityImprove * 8 + rng.random();
                if (!best || score > best.score) {
                    best = { date, score, continuityImprove, surplus };
                }
            });
            return best;
        };

        for (let step = 0; step < maxRepairSteps; step++) {
            const shortages = buildShortages();
            if (shortages.length === 0) break;

            let bestAction = null;

            for (let sIdx = 0; sIdx < shortages.length; sIdx++) {
                const shortage = shortages[sIdx];
                const shift = shortage.shift;
                const date = shortage.date;
                const dPos = dateList.indexOf(date);
                if (dPos < 0) continue;

                const pool = staffByShift[shift] || [];
                for (let pIdx = 0; pIdx < pool.length; pIdx++) {
                    const sid = pool[pIdx];
                    if (assignedSet[sid].has(date)) continue;
                    if (this.isHardBlocked(sid, date, requestState, nightMap)) continue;
                    const breakMaxWork = this.willBreakMaxWork(assignedSet[sid], dateList, dPos, relax.maxWork, fixedWorkSet[sid]);
                    if (breakMaxWork && allowBreakMaxWorkOnEmergency !== true) continue;

                    const actual = this.normalizeNumber(actualByStaff[sid], 0);
                    const target = this.normalizeNumber(targetDays[sid], 0);
                    const cap = Math.max(0, Math.floor(this.normalizeNumber(extraCapByStaff[sid], 0)));
                    const emergencyCap = Math.max(0, Math.floor(this.normalizeNumber(maxEmergencyExtraDayPerStaff, 0)));
                    const underGap = Math.max(0, target - actual);
                    const overCapGap = Math.max(0, actual - (target + cap));
                    const maxAllowed = allowEmergencyOverTarget === true
                        ? (target + cap + emergencyCap)
                        : (target + cap);

                    const canAdd = actual < maxAllowed;
                    if (canAdd) {
                        const continuityScore =
                            this.continuityScore(assignedSet[sid], dateList, dPos, relax, fixedWorkSet[sid]) +
                            this.restBreakScore(assignedSet[sid], dateList, dPos, relax.maxRest, fixedWorkSet[sid]);
                        const overPenalty = Math.max(0, (actual + 1) - (target + cap));
                        const breakPenalty = breakMaxWork ? 120 : 0;
                        const extraBiasScore = this.getExtraCandidateBiasScore(
                            sid,
                            actual,
                            target,
                            extraFairnessProfile,
                            config
                        );
                        const score =
                            shortage.gap * 5000 +
                            underGap * 260 +
                            overCapGap * 40 -
                            overPenalty * 180 -
                            breakPenalty +
                            extraBiasScore +
                            continuityScore * 30 +
                            rng.random();
                        if (!bestAction || score > bestAction.score) {
                            bestAction = {
                                type: 'add',
                                sid,
                                shift,
                                date,
                                score
                            };
                        }
                    }

                    const moveOut = buildMoveOutCandidate(sid, shift, date);
                    if (!moveOut) continue;
                    const score =
                        shortage.gap * 4200 +
                        moveOut.surplus * 240 +
                        moveOut.continuityImprove * 10 +
                        rng.random();
                    if (!bestAction || score > bestAction.score) {
                        bestAction = {
                            type: 'move',
                            sid,
                            shift,
                            date,
                            fromDate: moveOut.date,
                            score
                        };
                    }
                }
            }

            if (!bestAction) break;

            if (bestAction.type === 'add') {
                assignedSet[bestAction.sid].add(bestAction.date);
                scheduleByStaff[bestAction.sid][bestAction.date] = bestAction.shift;
                actualByStaff[bestAction.sid] = this.normalizeNumber(actualByStaff[bestAction.sid], 0) + 1;
                dailyCount[bestAction.date][bestAction.shift] = this.normalizeNumber(dailyCount[bestAction.date][bestAction.shift], 0) + 1;
                addCount += 1;
                shortageReduced += 1;
                continue;
            }

            assignedSet[bestAction.sid].delete(bestAction.fromDate);
            delete scheduleByStaff[bestAction.sid][bestAction.fromDate];
            dailyCount[bestAction.fromDate][bestAction.shift] = Math.max(
                0,
                this.normalizeNumber(dailyCount[bestAction.fromDate][bestAction.shift], 0) - 1
            );

            assignedSet[bestAction.sid].add(bestAction.date);
            scheduleByStaff[bestAction.sid][bestAction.date] = bestAction.shift;
            dailyCount[bestAction.date][bestAction.shift] = this.normalizeNumber(dailyCount[bestAction.date][bestAction.shift], 0) + 1;
            moveCount += 1;
            shortageReduced += 1;
        }

        return { addCount, moveCount, shortageReduced };
    },

    repairHardTargetMismatch(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            extraCapByStaff = {},
            maxRepairSteps = 20
        } = ctx;

        const assignedSet = {};
        const fixedWorkSet = {};
        const actualByStaff = {};
        const staffByShift = {};
        const dailyCount = {};
        const datePosMap = {};
        let transferCount = 0;
        let addCount = 0;
        let dropCount = 0;
        let hardGain = 0;

        dateList.forEach((date, idx) => {
            datePosMap[date] = idx;
            dailyCount[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                dailyCount[date][shift] = 0;
            });
        });
        this.SHIFT_TYPES.forEach((shift) => {
            staffByShift[shift] = [];
        });

        const calcGap = (sid, actualVal = null) => {
            const actual = actualVal == null
                ? this.normalizeNumber(actualByStaff[sid], 0)
                : this.normalizeNumber(actualVal, 0);
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
            const cap = Math.max(0, Math.floor(this.normalizeNumber(extraCapByStaff[sid], 0)));
            const lower = Math.max(0, target - actual);
            const upper = Math.max(0, actual - (target + cap));
            return { actual, target, cap, lower, upper, total: lower + upper };
        };

        staffIds.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            assignedSet[sid] = new Set(Object.keys(scheduleByStaff[sid] || {}));
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
            actualByStaff[sid] = assignedSet[sid].size;
            if (shift && staffByShift[shift]) {
                staffByShift[shift].push(sid);
            }
            assignedSet[sid].forEach((date) => {
                if (dailyCount[date] && dailyCount[date][shift] != null) {
                    dailyCount[date][shift] += 1;
                }
            });
        });

        const computeResidualTargetMismatch = () => {
            return staffIds.reduce((sum, sid) => sum + calcGap(sid).total, 0);
        };

        for (let step = 0; step < maxRepairSteps; step++) {
            const residual = computeResidualTargetMismatch();
            if (residual <= 0) break;

            const gapByStaff = {};
            staffIds.forEach((sid) => {
                gapByStaff[sid] = calcGap(sid);
            });

            let bestAction = null;
            const consider = (action) => {
                if (!action) return;
                if (!bestAction || action.score > bestAction.score) {
                    bestAction = action;
                }
            };

            this.SHIFT_TYPES.forEach((shift) => {
                const pool = staffByShift[shift] || [];
                if (pool.length === 0) return;

                const receivers = pool
                    .filter((sid) => (gapByStaff[sid]?.lower || 0) > 0)
                    .sort((a, b) => (gapByStaff[b].lower - gapByStaff[a].lower));

                const donors = pool
                    .filter((sid) => {
                        const g = gapByStaff[sid] || {};
                        return (g.upper || 0) > 0 || g.actual > g.target;
                    })
                    .sort((a, b) => {
                        const ga = gapByStaff[a];
                        const gb = gapByStaff[b];
                        const pa = Math.max(ga.upper, Math.max(0, ga.actual - ga.target));
                        const pb = Math.max(gb.upper, Math.max(0, gb.actual - gb.target));
                        return pb - pa;
                    });
                const receiverTop = receivers.slice(0, 3);
                const donorTop = donors.slice(0, 3);

                // 动作1：同班别“转移1天”（优先同时降低接收者欠配与捐赠者超配）
                for (let rIdx = 0; rIdx < receiverTop.length; rIdx++) {
                    const receiverSid = receiverTop[rIdx];
                    const receiverGap = gapByStaff[receiverSid];
                    if (!receiverGap || receiverGap.lower <= 0) continue;

                    for (let dIdx = 0; dIdx < donorTop.length; dIdx++) {
                        const donorSid = donorTop[dIdx];
                        if (donorSid === receiverSid) continue;
                        const donorGap = gapByStaff[donorSid];
                        if (!donorGap) continue;

                        const donorDates = Array.from(assignedSet[donorSid] || [])
                            .map((date) => {
                                const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                                const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                                return { date, surplus: actual - need };
                            })
                            .sort((a, b) => b.surplus - a.surplus)
                            .slice(0, 6)
                            .map((x) => x.date);
                        for (let i = 0; i < donorDates.length; i++) {
                            const date = donorDates[i];
                            const pos = datePosMap[date];
                            if (pos == null) continue;
                            if (assignedSet[receiverSid].has(date)) continue;
                            if (this.isHardBlocked(receiverSid, date, requestState, nightMap)) continue;
                            const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                            const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                            if ((actual - 1) < need) continue;

                            const receiverBefore = receiverGap.total;
                            const donorBefore = donorGap.total;
                            const receiverAfter = calcGap(receiverSid, receiverGap.actual + 1).total;
                            const donorAfter = calcGap(donorSid, donorGap.actual - 1).total;
                            const hardImprove = (receiverBefore + donorBefore) - (receiverAfter + donorAfter);
                            if (hardImprove <= 0) continue;

                            const breakMaxWork = this.willBreakMaxWork(
                                assignedSet[receiverSid],
                                dateList,
                                pos,
                                relax.maxWork,
                                fixedWorkSet[receiverSid]
                            ) ? 1 : 0;
                            const score = hardImprove * 6000 - breakMaxWork * 90 + rng.random();
                            consider({
                                type: 'transfer',
                                shift,
                                receiverSid,
                                donorSid,
                                date,
                                hardImprove,
                                score
                            });
                        }
                    }
                }

                // 动作2：给欠配员工加1天（即使当天无缺班，也允许用于满足目标硬约束）
                for (let rIdx = 0; rIdx < receiverTop.length; rIdx++) {
                    const sid = receiverTop[rIdx];
                    const gap = gapByStaff[sid];
                    if (!gap || gap.lower <= 0) continue;

                    const candidateDates = dateList
                        .map((date, idx) => {
                            if (assignedSet[sid].has(date)) return null;
                            if (this.isHardBlocked(sid, date, requestState, nightMap)) return null;
                            const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                            const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                            const breakMax = this.willBreakMaxWork(
                                assignedSet[sid],
                                dateList,
                                idx,
                                relax.maxWork,
                                fixedWorkSet[sid]
                            ) ? 1 : 0;
                            return {
                                date,
                                idx,
                                shortage: Math.max(0, need - actual),
                                breakMax
                            };
                        })
                        .filter(Boolean)
                        .sort((a, b) => {
                            if (b.shortage !== a.shortage) return b.shortage - a.shortage;
                            if (a.breakMax !== b.breakMax) return a.breakMax - b.breakMax;
                            return 0;
                        })
                        .slice(0, 8);

                    for (let i = 0; i < candidateDates.length; i++) {
                        const cand = candidateDates[i];
                        const date = cand.date;
                        const dateIdx = cand.idx;
                        if (assignedSet[sid].has(date)) continue;
                        if (this.isHardBlocked(sid, date, requestState, nightMap)) continue;

                        const before = gap.total;
                        const after = calcGap(sid, gap.actual + 1).total;
                        const hardImprove = before - after;
                        if (hardImprove <= 0) continue;

                        const shortageBonus = this.normalizeNumber(cand.shortage, 0);
                        const breakMaxWork = this.willBreakMaxWork(
                            assignedSet[sid],
                            dateList,
                            dateIdx,
                            relax.maxWork,
                            fixedWorkSet[sid]
                        ) ? 1 : 0;
                        const score =
                            hardImprove * 3600 +
                            shortageBonus * 800 -
                            breakMaxWork * 120 +
                            rng.random();
                        consider({
                            type: 'add',
                            shift,
                            sid,
                            date,
                            hardImprove,
                            score
                        });
                    }
                }

                // 动作3：对超配员工减1天（不打穿最低人力）
                donorTop.forEach((sid) => {
                    const gap = gapByStaff[sid];
                    if (!gap || gap.upper <= 0) return;
                    const staffDates = Array.from(assignedSet[sid] || [])
                        .map((date) => {
                            const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                            const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                            return { date, surplus: actual - need };
                        })
                        .sort((a, b) => b.surplus - a.surplus)
                        .slice(0, 6)
                        .map((x) => x.date);
                    for (let i = 0; i < staffDates.length; i++) {
                        const date = staffDates[i];
                        const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                        const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                        if ((actual - 1) < need) continue;
                        const before = gap.total;
                        const after = calcGap(sid, gap.actual - 1).total;
                        const hardImprove = before - after;
                        if (hardImprove <= 0) continue;
                        const surplus = Math.max(0, actual - need);
                        const score = hardImprove * 3200 + surplus * 160 + rng.random();
                        consider({
                            type: 'drop',
                            shift,
                            sid,
                            date,
                            hardImprove,
                            score
                        });
                    }
                });
            });

            if (!bestAction) break;

            if (bestAction.type === 'transfer') {
                assignedSet[bestAction.receiverSid].add(bestAction.date);
                scheduleByStaff[bestAction.receiverSid][bestAction.date] = bestAction.shift;
                assignedSet[bestAction.donorSid].delete(bestAction.date);
                delete scheduleByStaff[bestAction.donorSid][bestAction.date];
                actualByStaff[bestAction.receiverSid] = this.normalizeNumber(actualByStaff[bestAction.receiverSid], 0) + 1;
                actualByStaff[bestAction.donorSid] = Math.max(0, this.normalizeNumber(actualByStaff[bestAction.donorSid], 0) - 1);
                transferCount += 1;
            } else if (bestAction.type === 'add') {
                assignedSet[bestAction.sid].add(bestAction.date);
                scheduleByStaff[bestAction.sid][bestAction.date] = bestAction.shift;
                actualByStaff[bestAction.sid] = this.normalizeNumber(actualByStaff[bestAction.sid], 0) + 1;
                dailyCount[bestAction.date][bestAction.shift] = this.normalizeNumber(dailyCount[bestAction.date][bestAction.shift], 0) + 1;
                addCount += 1;
            } else if (bestAction.type === 'drop') {
                assignedSet[bestAction.sid].delete(bestAction.date);
                delete scheduleByStaff[bestAction.sid][bestAction.date];
                actualByStaff[bestAction.sid] = Math.max(0, this.normalizeNumber(actualByStaff[bestAction.sid], 0) - 1);
                dropCount += 1;
            } else {
                break;
            }

            if (bestAction.type === 'drop') {
                dailyCount[bestAction.date][bestAction.shift] = Math.max(
                    0,
                    this.normalizeNumber(dailyCount[bestAction.date][bestAction.shift], 0) - 1
                );
            }

            hardGain += Math.max(0, this.normalizeNumber(bestAction.hardImprove, 0));
        }

        return {
            transferCount,
            addCount,
            dropCount,
            hardGain,
            residualTargetMismatch: computeResidualTargetMismatch()
        };
    },

    enforceTargetFloorByGreedyAdds(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            dailyMinDemand,
            relax,
            rng,
            maxAddSteps = 180
        } = ctx;

        const assignedSet = {};
        const fixedWorkSet = {};
        let addedCount = 0;
        let clearedCount = 0;
        const unresolvedByStaff = {};
        const clearableTypes = new Set(['ANNUAL', 'LEGAL', 'REQ']);

        staffIds.forEach((sid) => {
            assignedSet[sid] = new Set(Object.keys(scheduleByStaff[sid] || {}));
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
        });

        const getDeficit = (sid) => {
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
            return Math.max(0, target - (assignedSet[sid] ? assignedSet[sid].size : 0));
        };

        for (let step = 0; step < maxAddSteps; step++) {
            const deficitRows = staffIds
                .map((sid) => ({ sid, deficit: getDeficit(sid) }))
                .filter((x) => x.deficit > 0)
                .sort((a, b) => b.deficit - a.deficit);
            if (deficitRows.length === 0) {
                break;
            }

            let changed = false;
            for (let i = 0; i < deficitRows.length; i++) {
                const sid = deficitRows[i].sid;
                const deficit = getDeficit(sid);
                if (deficit <= 0) continue;

                const shift = monthlyShiftAssignments[sid];
                if (!shift || !this.SHIFT_TYPES.includes(shift)) {
                    unresolvedByStaff[sid] = deficit;
                    continue;
                }

                let best = null;
                for (let dIdx = 0; dIdx < dateList.length; dIdx++) {
                    const date = dateList[dIdx];
                    if (assignedSet[sid].has(date)) continue;
                    if (nightMap[sid] && nightMap[sid][date]) continue;

                    const t = requestState[sid] && requestState[sid][date];
                    if (t === 'REST' || t === 'SICK') continue;
                    const requiresClear = !!t;
                    if (requiresClear && !clearableTypes.has(t)) continue;

                    const continuityScore =
                        this.continuityScore(assignedSet[sid], dateList, dIdx, relax, fixedWorkSet[sid]) +
                        this.restBreakScore(assignedSet[sid], dateList, dIdx, relax.maxRest, fixedWorkSet[sid]);
                    const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                    const clearPenalty = requiresClear ? 120 : 0;
                    const score =
                        continuityScore * 35 +
                        need * 10 -
                        clearPenalty +
                        rng.random();

                    if (!best || score > best.score) {
                        best = { sid, date, shift, requiresClear, score };
                    }
                }

                if (!best) {
                    unresolvedByStaff[sid] = deficit;
                    continue;
                }

                if (best.requiresClear && requestState[best.sid] && requestState[best.sid][best.date]) {
                    delete requestState[best.sid][best.date];
                    clearedCount += 1;
                }

                assignedSet[best.sid].add(best.date);
                scheduleByStaff[best.sid][best.date] = best.shift;
                addedCount += 1;
                changed = true;
                if (addedCount >= maxAddSteps) break;
            }

            if (!changed || addedCount >= maxAddSteps) {
                break;
            }
        }

        Object.keys(unresolvedByStaff).forEach((sid) => {
            const latest = getDeficit(sid);
            if (latest <= 0) {
                delete unresolvedByStaff[sid];
            } else {
                unresolvedByStaff[sid] = latest;
            }
        });

        return {
            addedCount,
            clearedCount,
            unresolvedByStaff,
            unresolvedCount: Object.keys(unresolvedByStaff).length
        };
    },

    repairUnderTargetByShiftTransfers(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            requestState,
            nightMap,
            relax,
            rng,
            maxTransferSteps = 180
        } = ctx;

        const assignedSet = {};
        const fixedWorkSet = {};
        const actualByStaff = {};
        const staffByShift = {};
        const datePosMap = {};
        let transferCount = 0;
        let underGain = 0;

        dateList.forEach((date, idx) => {
            datePosMap[date] = idx;
        });
        this.SHIFT_TYPES.forEach((shift) => { staffByShift[shift] = []; });

        staffIds.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            assignedSet[sid] = new Set(Object.keys(scheduleByStaff[sid] || {}));
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
            actualByStaff[sid] = assignedSet[sid].size;
            if (shift && staffByShift[shift]) {
                staffByShift[shift].push(sid);
            }
        });

        const deficit = (sid, actualVal = null) => {
            const actual = actualVal == null
                ? this.normalizeNumber(actualByStaff[sid], 0)
                : this.normalizeNumber(actualVal, 0);
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
            return Math.max(0, target - actual);
        };
        const surplus = (sid, actualVal = null) => {
            const actual = actualVal == null
                ? this.normalizeNumber(actualByStaff[sid], 0)
                : this.normalizeNumber(actualVal, 0);
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
            return Math.max(0, actual - target);
        };
        const residualUnderTarget = () => {
            return staffIds.reduce((sum, sid) => sum + deficit(sid), 0);
        };

        for (let step = 0; step < maxTransferSteps; step++) {
            const receiverRows = staffIds
                .map((sid) => ({
                    sid,
                    def: deficit(sid)
                }))
                .filter((x) => x.def > 0)
                .sort((a, b) => b.def - a.def)
                .slice(0, 10);
            if (receiverRows.length === 0) break;

            let bestMove = null;

            for (let rIdx = 0; rIdx < receiverRows.length; rIdx++) {
                const receiverSid = receiverRows[rIdx].sid;
                const receiverDef = receiverRows[rIdx].def;
                const shift = monthlyShiftAssignments[receiverSid];
                if (!shift || !this.SHIFT_TYPES.includes(shift)) continue;

                const receiverBefore = this.getContinuityMetricsFromSet(
                    assignedSet[receiverSid],
                    dateList,
                    relax,
                    fixedWorkSet[receiverSid]
                );

                const donors = (staffByShift[shift] || [])
                    .filter((sid) => sid !== receiverSid && surplus(sid) > 0)
                    .sort((a, b) => surplus(b) - surplus(a))
                    .slice(0, 10);
                if (donors.length === 0) continue;

                for (let dIdx = 0; dIdx < donors.length; dIdx++) {
                    const donorSid = donors[dIdx];
                    const donorSur = surplus(donorSid);
                    if (donorSur <= 0) continue;

                    const donorBefore = this.getContinuityMetricsFromSet(
                        assignedSet[donorSid],
                        dateList,
                        relax,
                        fixedWorkSet[donorSid]
                    );
                    const donorDates = Array.from(assignedSet[donorSid] || [])
                        .sort((a, b) => String(a).localeCompare(String(b)));

                    for (let i = 0; i < donorDates.length; i++) {
                        const date = donorDates[i];
                        const dPos = datePosMap[date];
                        if (dPos == null) continue;
                        if (assignedSet[receiverSid].has(date)) continue;
                        if (this.isHardBlocked(receiverSid, date, requestState, nightMap)) continue;
                        if (this.willBreakMaxWork(assignedSet[receiverSid], dateList, dPos, relax.maxWork, fixedWorkSet[receiverSid])) continue;

                        const beforeUnder = deficit(receiverSid) + deficit(donorSid);
                        const afterUnder =
                            deficit(receiverSid, this.normalizeNumber(actualByStaff[receiverSid], 0) + 1) +
                            deficit(donorSid, this.normalizeNumber(actualByStaff[donorSid], 0) - 1);
                        const gain = beforeUnder - afterUnder;
                        if (gain <= 0) continue;

                        const receiverAfterSet = new Set(assignedSet[receiverSid]);
                        receiverAfterSet.add(date);
                        const donorAfterSet = new Set(assignedSet[donorSid]);
                        donorAfterSet.delete(date);

                        const receiverAfter = this.getContinuityMetricsFromSet(
                            receiverAfterSet,
                            dateList,
                            relax,
                            fixedWorkSet[receiverSid]
                        );
                        const donorAfter = this.getContinuityMetricsFromSet(
                            donorAfterSet,
                            dateList,
                            relax,
                            fixedWorkSet[donorSid]
                        );

                        const continuityDelta =
                            this.continuityPairScore(receiverBefore, donorBefore) -
                            this.continuityPairScore(receiverAfter, donorAfter);
                        const score =
                            gain * 5200 +
                            receiverDef * 260 +
                            donorSur * 180 +
                            continuityDelta * 10 +
                            rng.random();

                        if (!bestMove || score > bestMove.score) {
                            bestMove = {
                                shift,
                                receiverSid,
                                donorSid,
                                date,
                                gain,
                                score
                            };
                        }
                    }
                }
            }

            if (!bestMove) break;

            assignedSet[bestMove.receiverSid].add(bestMove.date);
            scheduleByStaff[bestMove.receiverSid][bestMove.date] = bestMove.shift;
            assignedSet[bestMove.donorSid].delete(bestMove.date);
            delete scheduleByStaff[bestMove.donorSid][bestMove.date];
            actualByStaff[bestMove.receiverSid] = this.normalizeNumber(actualByStaff[bestMove.receiverSid], 0) + 1;
            actualByStaff[bestMove.donorSid] = Math.max(0, this.normalizeNumber(actualByStaff[bestMove.donorSid], 0) - 1);
            transferCount += 1;
            underGain += Math.max(0, this.normalizeNumber(bestMove.gain, 0));
        }

        return {
            transferCount,
            underGain,
            residualUnderTarget: residualUnderTarget()
        };
    },

    repairOverflowByShiftTransfers(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            extraCapByStaff = {},
            requestState,
            nightMap,
            relax,
            rng,
            config = {},
            maxTransferSteps = 120
        } = ctx;

        const assignedSet = {};
        const fixedWorkSet = {};
        const actualByStaff = {};
        const staffByShift = {};
        const extraFairnessProfile = this.buildExtraFairnessProfile(staffIds, targetDays, config);
        let transferCount = 0;
        let overflowGain = 0;

        const upperTarget = (sid) => {
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
            const cap = Math.max(0, Math.floor(this.normalizeNumber(extraCapByStaff[sid], 0)));
            return target + cap;
        };
        const overflow = (sid, actualVal = null) => {
            const actual = actualVal == null
                ? this.normalizeNumber(actualByStaff[sid], 0)
                : this.normalizeNumber(actualVal, 0);
            return Math.max(0, actual - upperTarget(sid));
        };
        const headroom = (sid, actualVal = null) => {
            const actual = actualVal == null
                ? this.normalizeNumber(actualByStaff[sid], 0)
                : this.normalizeNumber(actualVal, 0);
            return Math.max(0, upperTarget(sid) - actual);
        };

        this.SHIFT_TYPES.forEach((shift) => { staffByShift[shift] = []; });
        staffIds.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            assignedSet[sid] = new Set(Object.keys(scheduleByStaff[sid] || {}));
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
            actualByStaff[sid] = assignedSet[sid].size;
            if (shift && staffByShift[shift]) staffByShift[shift].push(sid);
        });

        for (let step = 0; step < maxTransferSteps; step++) {
            let bestMove = null;

            this.SHIFT_TYPES.forEach((shift) => {
                const pool = staffByShift[shift] || [];
                if (pool.length < 2) return;

                const donors = pool
                    .filter((sid) => overflow(sid) > 0 && this.normalizeNumber(actualByStaff[sid], 0) > this.normalizeNumber(targetDays[sid], 0))
                    .sort((a, b) => {
                        const overDiff = overflow(b) - overflow(a);
                        if (overDiff !== 0) return overDiff;
                        const aBias = this.normalizeNumber(extraFairnessProfile.byStaff?.[a], 0);
                        const bBias = this.normalizeNumber(extraFairnessProfile.byStaff?.[b], 0);
                        // 供给方优先选择“目标天数高于均值(偏置更负)”的员工
                        if (aBias !== bBias) return aBias - bBias;
                        return 0;
                    })
                    .slice(0, 6);
                const receivers = pool
                    .filter((sid) => headroom(sid) > 0)
                    .sort((a, b) => headroom(b) - headroom(a))
                    .slice(0, 8);
                if (donors.length === 0 || receivers.length === 0) return;

                donors.forEach((donorSid) => {
                    const donorDates = Array.from(assignedSet[donorSid] || []);
                    donorDates.forEach((date) => {
                        const dPos = dateList.indexOf(date);
                        if (dPos < 0) return;
                        receivers.forEach((receiverSid) => {
                            if (receiverSid === donorSid) return;
                            if (assignedSet[receiverSid].has(date)) return;
                            if (this.isHardBlocked(receiverSid, date, requestState, nightMap)) return;
                            if (this.willBreakMaxWork(assignedSet[receiverSid], dateList, dPos, relax.maxWork, fixedWorkSet[receiverSid])) return;
                            if (this.normalizeNumber(actualByStaff[donorSid], 0) - 1 < this.normalizeNumber(targetDays[donorSid], 0)) return;

                            const beforeOverflow = overflow(donorSid) + overflow(receiverSid);
                            const afterOverflow =
                                overflow(donorSid, this.normalizeNumber(actualByStaff[donorSid], 0) - 1) +
                                overflow(receiverSid, this.normalizeNumber(actualByStaff[receiverSid], 0) + 1);
                            const improve = beforeOverflow - afterOverflow;
                            if (improve <= 0) return;

                            const score =
                                improve * 1000 +
                                Math.max(0, -this.normalizeNumber(extraFairnessProfile.byStaff?.[donorSid], 0)) * 120 +
                                Math.max(0, this.normalizeNumber(extraFairnessProfile.byStaff?.[receiverSid], 0)) * 120 +
                                headroom(receiverSid) * 40 +
                                rng.random();
                            if (!bestMove || score > bestMove.score) {
                                bestMove = {
                                    shift,
                                    donorSid,
                                    receiverSid,
                                    date,
                                    improve,
                                    score
                                };
                            }
                        });
                    });
                });
            });

            if (!bestMove) break;

            assignedSet[bestMove.donorSid].delete(bestMove.date);
            delete scheduleByStaff[bestMove.donorSid][bestMove.date];
            assignedSet[bestMove.receiverSid].add(bestMove.date);
            scheduleByStaff[bestMove.receiverSid][bestMove.date] = bestMove.shift;
            actualByStaff[bestMove.donorSid] = Math.max(0, this.normalizeNumber(actualByStaff[bestMove.donorSid], 0) - 1);
            actualByStaff[bestMove.receiverSid] = this.normalizeNumber(actualByStaff[bestMove.receiverSid], 0) + 1;
            transferCount += 1;
            overflowGain += this.normalizeNumber(bestMove.improve, 0);
        }

        return { transferCount, overflowGain };
    },

    repairTargetOverflowBySafeDrops(ctx) {
        const {
            staffIds,
            dateList,
            scheduleByStaff,
            monthlyShiftAssignments,
            targetDays,
            extraCapByStaff = {},
            dailyMinDemand,
            requestState,
            nightMap,
            relax,
            rng,
            config = {},
            maxDropSteps = 120
        } = ctx;

        const assignedSet = {};
        const fixedWorkSet = {};
        const actualByStaff = {};
        const dailyCount = {};
        const extraFairnessProfile = this.buildExtraFairnessProfile(staffIds, targetDays, config);
        let dropCount = 0;
        let overflowGain = 0;

        const upperTarget = (sid) => {
            const target = Math.max(0, Math.floor(this.normalizeNumber(targetDays[sid], 0)));
            const cap = Math.max(0, Math.floor(this.normalizeNumber(extraCapByStaff[sid], 0)));
            return target + cap;
        };
        const overflow = (sid, actualVal = null) => {
            const actual = actualVal == null
                ? this.normalizeNumber(actualByStaff[sid], 0)
                : this.normalizeNumber(actualVal, 0);
            return Math.max(0, actual - upperTarget(sid));
        };
        const residualOverflow = () => {
            return staffIds.reduce((sum, sid) => sum + overflow(sid), 0);
        };

        dateList.forEach((date) => {
            dailyCount[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                dailyCount[date][shift] = 0;
            });
        });

        staffIds.forEach((sid) => {
            const shift = monthlyShiftAssignments[sid];
            assignedSet[sid] = new Set(Object.keys(scheduleByStaff[sid] || {}));
            fixedWorkSet[sid] = new Set(Object.keys(nightMap[sid] || {}));
            actualByStaff[sid] = assignedSet[sid].size;
            assignedSet[sid].forEach((date) => {
                if (dailyCount[date] && dailyCount[date][shift] != null) {
                    dailyCount[date][shift] += 1;
                }
            });
        });

        for (let step = 0; step < maxDropSteps; step++) {
            let bestMove = null;
            const overStaff = staffIds
                .filter((sid) => overflow(sid) > 0 && this.normalizeNumber(actualByStaff[sid], 0) > this.normalizeNumber(targetDays[sid], 0))
                .sort((a, b) => {
                    const overDiff = overflow(b) - overflow(a);
                    if (overDiff !== 0) return overDiff;
                    const aBias = this.normalizeNumber(extraFairnessProfile.byStaff?.[a], 0);
                    const bBias = this.normalizeNumber(extraFairnessProfile.byStaff?.[b], 0);
                    if (aBias !== bBias) return aBias - bBias;
                    return 0;
                })
                .slice(0, 10);
            if (overStaff.length === 0) break;

            overStaff.forEach((sid) => {
                const shift = monthlyShiftAssignments[sid];
                if (!shift || !this.SHIFT_TYPES.includes(shift)) return;
                const staffDates = Array.from(assignedSet[sid] || [])
                    .map((date) => {
                        const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                        const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                        return { date, surplus: actual - need };
                    })
                    .sort((a, b) => b.surplus - a.surplus)
                    .slice(0, 12);

                staffDates.forEach(({ date, surplus }) => {
                    if (surplus <= 0) return;
                    const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                    const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                    if ((actual - 1) < need) return;
                    if (this.normalizeNumber(actualByStaff[sid], 0) - 1 < this.normalizeNumber(targetDays[sid], 0)) return;
                    const dPos = dateList.indexOf(date);
                    if (dPos >= 0) {
                        const beforeScore = this.continuityScore(assignedSet[sid], dateList, dPos, relax, fixedWorkSet[sid]);
                        const cloned = new Set(assignedSet[sid]);
                        cloned.delete(date);
                        const afterScore = this.continuityScore(cloned, dateList, dPos, relax, fixedWorkSet[sid]);
                        if (afterScore < beforeScore - 4) {
                            return;
                        }
                    }

                    const beforeOverflow = overflow(sid);
                    const afterOverflow = overflow(sid, this.normalizeNumber(actualByStaff[sid], 0) - 1);
                    const improve = beforeOverflow - afterOverflow;
                    if (improve <= 0) return;
                    const score =
                        improve * 800 +
                        surplus * 120 +
                        Math.max(0, -this.normalizeNumber(extraFairnessProfile.byStaff?.[sid], 0)) * 120 +
                        rng.random();
                    if (!bestMove || score > bestMove.score) {
                        bestMove = { sid, shift, date, improve, score };
                    }
                });
            });

            if (!bestMove) break;

            assignedSet[bestMove.sid].delete(bestMove.date);
            delete scheduleByStaff[bestMove.sid][bestMove.date];
            actualByStaff[bestMove.sid] = Math.max(0, this.normalizeNumber(actualByStaff[bestMove.sid], 0) - 1);
            dailyCount[bestMove.date][bestMove.shift] = Math.max(
                0,
                this.normalizeNumber(dailyCount[bestMove.date][bestMove.shift], 0) - 1
            );
            dropCount += 1;
            overflowGain += this.normalizeNumber(bestMove.improve, 0);
        }

        return { dropCount, overflowGain, residualOverflow: residualOverflow() };
    },

    continuityScore(assignedSet, dateList, dIdx, relax, fixedWorkSet = new Set()) {
        const leftWorked = dIdx > 0 && (assignedSet.has(dateList[dIdx - 1]) || fixedWorkSet.has(dateList[dIdx - 1]));
        const rightWorked = dIdx + 1 < dateList.length && (assignedSet.has(dateList[dIdx + 1]) || fixedWorkSet.has(dateList[dIdx + 1]));

        let score = 0;
        if (leftWorked) score += 2;
        if (rightWorked) score += 2;

        // 更偏好形成 3~6 的工作段
        const leftLen = this.runLength(assignedSet, dateList, dIdx - 1, -1, fixedWorkSet);
        const rightLen = this.runLength(assignedSet, dateList, dIdx + 1, +1, fixedWorkSet);
        const projected = leftLen + 1 + rightLen;

        if (projected >= relax.minWork && projected <= relax.maxWork) {
            score += 3;
        }

        return score;
    },

    restBreakScore(assignedSet, dateList, dIdx, maxRest, fixedWorkSet = new Set()) {
        // 插入一个工作日，能打断过长休息段时给高分
        const leftRest = this.restLength(assignedSet, dateList, dIdx - 1, -1, fixedWorkSet);
        const rightRest = this.restLength(assignedSet, dateList, dIdx + 1, +1, fixedWorkSet);
        const beforeMax = leftRest + 1 + rightRest;
        const afterMax = Math.max(Math.max(0, leftRest), Math.max(0, rightRest));
        if (beforeMax > maxRest && afterMax <= maxRest) {
            return 4;
        }
        if (beforeMax > maxRest) {
            return 2;
        }
        return 0;
    },

    runLength(assignedSet, dateList, startIdx, direction, fixedWorkSet = new Set()) {
        let len = 0;
        for (let i = startIdx; i >= 0 && i < dateList.length; i += direction) {
            if (!assignedSet.has(dateList[i]) && !fixedWorkSet.has(dateList[i])) break;
            len += 1;
        }
        return len;
    },

    restLength(assignedSet, dateList, startIdx, direction, fixedWorkSet = new Set()) {
        let len = 0;
        for (let i = startIdx; i >= 0 && i < dateList.length; i += direction) {
            if (assignedSet.has(dateList[i]) || fixedWorkSet.has(dateList[i])) break;
            len += 1;
        }
        return len;
    },

    getWorkPressure(sid, dIdx, dateList, requestState, nightMap, remaining) {
        const rem = remaining[sid] || 0;
        if (rem <= 0) return 0;

        let can = 0;
        for (let i = dIdx; i < dateList.length; i++) {
            const date = dateList[i];
            if (!this.isHardBlocked(sid, date, requestState, nightMap)) {
                can += 1;
            }
        }

        if (can <= 0) return rem * 100;
        return rem / can;
    },

    computeDailyShortageSummary(scheduleByStaff, dateList, dailyMinDemand, monthlyShiftAssignments = {}) {
        const dailyCount = {};
        dateList.forEach((date) => {
            dailyCount[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                dailyCount[date][shift] = 0;
            });
        });

        Object.entries(scheduleByStaff || {}).forEach(([sid, dates]) => {
            const fallbackShift = monthlyShiftAssignments[sid];
            Object.entries(dates || {}).forEach(([date, shiftRaw]) => {
                const shift = this.SHIFT_TYPES.includes(shiftRaw) ? shiftRaw : fallbackShift;
                if (!shift || !dailyCount[date] || dailyCount[date][shift] == null) return;
                dailyCount[date][shift] += 1;
            });
        });

        const byDate = {};
        let total = 0;
        dateList.forEach((date) => {
            let dayTotal = 0;
            const row = {};
            this.SHIFT_TYPES.forEach((shift) => {
                const need = this.normalizeNumber(dailyMinDemand?.[date]?.[shift], 0);
                const actual = this.normalizeNumber(dailyCount?.[date]?.[shift], 0);
                const gap = Math.max(0, need - actual);
                if (gap > 0) {
                    row[shift] = gap;
                    dayTotal += gap;
                }
            });
            if (dayTotal > 0) {
                byDate[date] = row;
                total += dayTotal;
            }
        });

        return { total, byDate, dailyCount };
    },

    countShiftDistribution(monthlyShiftAssignments) {
        const out = {};
        this.SHIFT_TYPES.forEach((s) => { out[s] = 0; });
        Object.values(monthlyShiftAssignments || {}).forEach((s) => {
            if (out[s] != null) out[s] += 1;
        });
        return out;
    },

    countAssignedShift(assignment, shift) {
        return Object.values(assignment).filter(s => s === shift).length;
    },

    resolveWatchDates(dateList, visualization) {
        if (!visualization || visualization.enabled !== true) {
            return [];
        }
        const watchMonthDays = Array.isArray(visualization.watchMonthDays)
            ? visualization.watchMonthDays.map(x => String(x || '').trim()).filter(Boolean)
            : [];
        if (watchMonthDays.length === 0) return [];

        const set = new Set(watchMonthDays);
        return dateList.filter((date) => set.has(String(date).slice(5)));
    },

    buildCoverageForDate(scheduleByStaff, date, dailyMinDemand) {
        const counts = {};
        this.SHIFT_TYPES.forEach((shift) => {
            counts[shift] = 0;
        });
        Object.values(scheduleByStaff || {}).forEach((dates) => {
            const shift = dates ? dates[date] : null;
            if (shift && counts[shift] != null) {
                counts[shift] += 1;
            }
        });

        const need = dailyMinDemand[date] || {};
        const parts = [];
        let gapTotal = 0;
        this.SHIFT_TYPES.forEach((shift) => {
            const actual = counts[shift] || 0;
            const req = this.normalizeNumber(need[shift], 0);
            const gap = Math.max(0, req - actual);
            gapTotal += gap;
            parts.push(`${shift}:${actual}/${req}${gap > 0 ? `(-${gap})` : ''}`);
        });
        return {
            counts,
            need,
            gapTotal,
            text: parts.join(' ')
        };
    },

    logDateCoverageTrace(ctx) {
        const { stage, traceLabel, date, countByShift, needByShift } = ctx;
        const parts = [];
        let gapTotal = 0;
        this.SHIFT_TYPES.forEach((shift) => {
            const actual = this.normalizeNumber(countByShift?.[shift], 0);
            const need = this.normalizeNumber(needByShift?.[shift], 0);
            const gap = Math.max(0, need - actual);
            gapTotal += gap;
            parts.push(`${shift}:${actual}/${need}${gap > 0 ? `(-${gap})` : ''}`);
        });
        console.log(`[CSPSolverV2][Trace:${traceLabel}] ${stage} ${date} => ${parts.join(' ')} | gap=${gapTotal}`);
    },

    logAttemptSummary(ctx) {
        const {
            stepLabel,
            seedOffset,
            attempt,
            attemptCount,
            scheduleResult,
            watchDates = [],
            dailyMinDemand
        } = ctx;

        const hard = scheduleResult.hardViolations || {};
        console.log(
            `[CSPSolverV2][Attempt] step=${stepLabel} seed=${seedOffset + 1} try=${attempt + 1} #${attemptCount} ` +
            `score=${scheduleResult.score} hard=${hard.total || 0} shortage=${hard.dailyShortage || 0} targetMis=${hard.targetMismatch || 0} ` +
            `soft=${scheduleResult.softPenalty || 0}`
        );

        if (watchDates.length > 0) {
            watchDates.forEach((date) => {
                const cov = this.buildCoverageForDate(scheduleResult.scheduleByStaff, date, dailyMinDemand);
                console.log(`[CSPSolverV2][Attempt][Watch ${date}] ${cov.text} | gap=${cov.gapTotal}`);
            });
        }
    },

    logStepSummary(ctx) {
        const { level, clearStep, tryResult, watchDates = [], dailyMinDemand, totalAttempts } = ctx;
        const hard = tryResult.hardViolations || {};
        console.log(
            `[CSPSolverV2][StepSummary] level=${level} clearStep=${clearStep} totalAttempts=${totalAttempts} ` +
            `hard=${hard.total || 0} shortage=${hard.dailyShortage || 0} targetMis=${hard.targetMismatch || 0} score=${tryResult.score}`
        );
        if (watchDates.length > 0) {
            watchDates.forEach((date) => {
                const cov = this.buildCoverageForDate(tryResult.scheduleByStaff, date, dailyMinDemand);
                console.log(`[CSPSolverV2][StepSummary][Watch ${date}] ${cov.text} | gap=${cov.gapTotal}`);
            });
        }
    },

    logVacationClearAction(level, clearStep, clearTarget, clearRoundCount) {
        if (!clearTarget) return;
        console.log(
            `[CSPSolverV2][VacationClear] level=${level} clearStep=${clearStep} ` +
            `staff=${clearTarget.staffId} date=${clearTarget.dateStr} type=${clearTarget.type} personRoundCount=${clearRoundCount}`
        );
    },

    normalizeStaffId(staff) {
        return String(staff?.staffId || staff?.id || '').trim();
    },

    generateDateList(startDate, endDate) {
        const list = [];
        const c = new Date(startDate);
        const e = new Date(endDate);

        while (c <= e) {
            list.push(this.formatDate(c));
            c.setDate(c.getDate() + 1);
        }

        return list;
    },

    formatDate(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    createSeededRandom(seed) {
        let value = Math.abs(Math.floor(Number(seed) || 1)) % 2147483647;
        if (value <= 0) value += 2147483646;
        return {
            random() {
                value = (value * 16807) % 2147483647;
                return (value - 1) / 2147483646;
            }
        };
    },

    randomPick(arr, rng) {
        if (!arr || arr.length === 0) return null;
        const idx = Math.floor(rng.random() * arr.length);
        return arr[idx];
    },

    normalizeNumber(v, fallback = 0) {
        const n = Number(v);
        if (!Number.isFinite(n)) return fallback;
        return n;
    },

    firstFinite(values) {
        for (let i = 0; i < values.length; i++) {
            const n = Number(values[i]);
            if (Number.isFinite(n)) return n;
        }
        return null;
    },

    cloneDeep(obj) {
        return JSON.parse(JSON.stringify(obj || {}));
    },

    deepMerge(target, source) {
        const base = this.cloneDeep(target);
        if (!source || typeof source !== 'object') return base;

        Object.keys(source).forEach((k) => {
            const sv = source[k];
            const tv = base[k];

            if (Array.isArray(sv)) {
                base[k] = sv.slice();
            } else if (sv && typeof sv === 'object') {
                base[k] = this.deepMerge(tv && typeof tv === 'object' ? tv : {}, sv);
            } else {
                base[k] = sv;
            }
        });

        return base;
    }
};

if (typeof window !== 'undefined') {
    window.CSPSolver = CSPSolver;
}
