/**
 * CSP求解器 - 白班排班算法（三阶段逻辑）
 *
 * 正确的排班逻辑：
 * a. 确定每个人的当月班别所属（月度固定，全年均衡轮换）
 * b. 确定当天这个人上不上班（排除夜班、休息日等）
 * c. 如果上班的话，安排什么职能（基于技能、职能均衡）
 *
 * 核心设计：
 * 1. 班别均衡：每个人全年轮到5个班别（A1, A, A2, B1, B2）
 * 2. 当月固定：每个人当月固定一个班别
 * 3. 职能轮换：同一天不同的人做不同职能
 */

const CSPSolver = {
    // 班次列表
    SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2'],

    // 工作日班次类型
    WORK_SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2', 'NIGHT'],

    /**
     * 生成白班排班方案（三阶段算法）
     * @param {Object} params - 参数对象
     * @returns {Object} 排班结果 {schedule: {...}, stats: {...}}
     */
    async generateDayShiftSchedule(params) {
        const {
            staffData,
            scheduleConfig,
            personalRequests = {},
            restDays = {},
            nightSchedule = {},
            rules = {}
        } = params;

        console.log('[CSPSolver] 开始生成白班排班（三阶段算法）...');

        // 初始化结果
        const schedule = {};
        const stats = {
            totalAssignments: 0,
            shiftDistribution: {}, // 班别分布统计
            functionDistribution: {}, // 职能分布统计
            constraintViolations: []
        };

        // 生成日期列表
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        console.log(`[CSPSolver] 排班周期: ${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}, 共 ${dateList.length} 天`);

        // 获取人力配置
        const demandConfig = this.getDailyManpowerConfig();

        // ============ 阶段A：确定每个人的当月班别 ============
        console.log('\n[CSPSolver] ========== 阶段A：确定每个人的当月班别 ==========');
        const monthlyShifts = this.assignMonthlyShifts(staffData, scheduleConfig, demandConfig);
        console.log('[CSPSolver] 班别分配完成');
        Object.entries(monthlyShifts).forEach(([shiftId, count]) => {
            console.log(`  ${shiftId}: ${count}人`);
            stats.shiftDistribution[shiftId] = count;
        });

        // ============ 阶段B：确定每个人每天是否上班 ============
        console.log('\n[CSPSolver] ========== 阶段B：确定每个人每天是否上班 ==========');
        const workDays = this.determineWorkDays(staffData, dateList, monthlyShifts, nightSchedule, personalRequests, restDays);
        console.log('[CSPSolver] 工作日确定完成');

        // ============ 阶段C：为上班的人安排职能 ============
        console.log('\n[CSPSolver] ========== 阶段C：为上班的人安排职能 ==========');
        const finalSchedule = this.assignDailyFunctions(staffData, dateList, monthlyShifts, workDays, demandConfig, personalRequests);
        console.log('[CSPSolver] 职能分配完成');

        // 复制夜班和个性化休假需求
        Object.entries(nightSchedule).forEach(([staffId, dates]) => {
            if (!finalSchedule[staffId]) {
                finalSchedule[staffId] = {};
            }
            Object.entries(dates).forEach(([date, shift]) => {
                finalSchedule[staffId][date] = 'NIGHT';
            });
        });

        Object.entries(personalRequests).forEach(([staffId, dates]) => {
            if (!finalSchedule[staffId]) {
                finalSchedule[staffId] = {};
            }
            Object.entries(dates).forEach(([date, status]) => {
                if (status === 'REQ') {
                    finalSchedule[staffId][date] = 'REST';
                }
            });
        });

        // 统计
        Object.values(finalSchedule).forEach(staffSchedule => {
            Object.values(staffSchedule).forEach(shift => {
                if (shift && shift !== 'NIGHT' && shift !== 'REST') {
                    stats.totalAssignments++;
                }
            });
        });

        console.log('\n[CSPSolver] 白班排班完成');
        console.log(`  总分配数: ${stats.totalAssignments}`);

        return {
            schedule: finalSchedule,
            stats: stats
        };
    },

    /**
     * ========== 阶段A：确定每个人的当月班别 ==========
     * 策略：
     * 1. 优先从激活的月度班次配置读取（手动分配）
     * 2. 如果没有手动配置，则自动分配：
     *    - 根据各班次人力需求确定本月各班次需要的人数
     *    - 优先分配到本月人数不足的班次
     *    - 考虑个人历史班别（优先分配到没做过的班别）
     *    - 确保每个月的班别人数接近
     */
    assignMonthlyShifts(staffData, scheduleConfig, demandConfig) {
        // 优先检查是否有激活的月度班次配置
        if (typeof Store !== 'undefined') {
            const activeConfig = Store.getActiveMonthlyShiftConfig();
            if (activeConfig && activeConfig.monthlyShifts) {
                console.log('[CSPSolver] 使用手动配置的月度班次');
                console.log('[CSPSolver] 配置名称:', activeConfig.name);

                // 统计各班次人数
                const shiftStats = {};
                this.SHIFT_TYPES.forEach(shift => shiftStats[shift] = 0);
                Object.values(activeConfig.monthlyShifts).forEach(shift => {
                    if (shiftStats.hasOwnProperty(shift)) {
                        shiftStats[shift]++;
                    }
                });
                console.log('[CSPSolver] 各班次配置人数:');
                Object.entries(shiftStats).forEach(([shiftId, count]) => {
                    console.log(`  ${shiftId}: ${count}人`);
                });

                // 返回手动配置的班次分配
                return activeConfig.monthlyShifts;
            }
        }

        // 没有手动配置，使用自动分配逻辑（原有代码）
        console.log('[CSPSolver] 使用自动分配逻辑');

        // 计算各班次本月需要的人数
        const shiftDemands = this.calculateShiftDemands(demandConfig, scheduleConfig);
        console.log('[CSPSolver] 各班次本月需求人数:');
        Object.entries(shiftDemands).forEach(([shiftId, demand]) => {
            console.log(`  ${shiftId}: ${demand}人`);
        });

        // 获取所有人员的班别历史（从 Store 或初始化为空）
        const shiftHistory = this.getShiftHistory(staffData);

        // 为每个人分配班次
        const monthlyShifts = {};
        this.SHIFT_TYPES.forEach(shiftId => {
            monthlyShifts[shiftId] = [];
        });

        // 按优先级排序人员（优先分配给班别历史较少的人）
        const sortedStaff = this.rankStaffByShiftHistory(staffData, shiftHistory);

        // 贪心分配：满足各班次人力需求
        sortedStaff.forEach(staff => {
            // 找到人数最不足且该员工没做过的班次
            const bestShift = this.findBestShiftForStaff(staff, monthlyShifts, shiftDemands, shiftHistory);

            if (bestShift) {
                monthlyShifts[bestShift].push(staff.id);
                shiftHistory[staff.id] = shiftHistory[staff.id] || {};
                shiftHistory[staff.id][scheduleConfig.startDate] = bestShift;
            }
        });

        // 转换为 {staffId: shiftType} 格式
        const result = {};
        Object.entries(monthlyShifts).forEach(([shiftId, staffIds]) => {
            staffIds.forEach(staffId => {
                result[staffId] = shiftId;
            });
        });

        return result;
    },

    /**
     * 计算各班次本月需要的人数（取最大需求）
     */
    calculateShiftDemands(demandConfig, scheduleConfig) {
        const demands = {};
        this.SHIFT_TYPES.forEach(shiftId => {
            demands[shiftId] = 0;
        });

        // 获取该班次的默认需求
        const defaultDemands = {
            'A1': { min: 4, max: 4 },
            'A': { min: 5, max: 5 },
            'A2': { min: 4, max: 4 },
            'B1': { min: 4, max: 4 },
            'B2': { min: 6, max: 6 }
        };

        // 使用默认需求的max值作为该班次本月需要的人数
        Object.entries(defaultDemands).forEach(([shiftId, demand]) => {
            demands[shiftId] = demand.max;
        });

        return demands;
    },

    /**
     * 获取所有人员的班别历史
     */
    getShiftHistory(staffData) {
        // TODO: 从 Store 或数据库读取历史班别记录
        // 当前返回空对象，表示没有历史记录
        return {};
    },

    /**
     * 按优先级排序人员（班别历史少的优先）
     */
    rankStaffByShiftHistory(staffData, shiftHistory) {
        return staffData.map(staff => {
            const history = shiftHistory[staff.id] || {};
            const historyCount = Object.keys(history).length;
            return { ...staff, _historyCount: historyCount };
        }).sort((a, b) => a._historyCount - b._historyCount);
    },

    /**
     * 为员工找最佳班次
     */
    findBestShiftForStaff(staff, monthlyShifts, shiftDemands, shiftHistory) {
        const staffId = staff.id;
        const history = shiftHistory[staffId] || {};
        const historyShifts = Object.values(history);

        // 计算每个班次的得分（优先级）
        const scoredShifts = this.SHIFT_TYPES.map(shiftId => {
            let score = 0;

            // 1. 人数不足的班次优先
            const currentCount = monthlyShifts[shiftId].length;
            const demand = shiftDemands[shiftId];
            if (currentCount < demand) {
                score += (demand - currentCount) * 100; // 人数不足越多，优先级越高
            }

            // 2. 没做过的班次优先
            if (!historyShifts.includes(shiftId)) {
                score += 50;
            }

            // 3. 班次历史均衡（优先分配到最少做的班次）
            const historyCount = historyShifts.filter(s => s === shiftId).length;
            score -= historyCount * 10;

            return { shiftId, score };
        });

        // 按得分降序排序
        scoredShifts.sort((a, b) => b.score - a.score);

        // 返回得分最高且人数未满的班次
        for (const { shiftId } of scoredShifts) {
            if (monthlyShifts[shiftId].length < shiftDemands[shiftId]) {
                return shiftId;
            }
        }

        // 如果所有班次都满了，返回人数最少的班次（用于处理总人数多于需求的情况）
        let minCount = Infinity;
        let minShift = null;
        for (const shiftId of this.SHIFT_TYPES) {
            if (monthlyShifts[shiftId].length < minCount) {
                minCount = monthlyShifts[shiftId].length;
                minShift = shiftId;
            }
        }
        return minShift;
    },

    /**
     * ========== 阶段B：确定每个人每天是否上班 ==========
     * 正确的休假逻辑：
     * 1. 有夜班排班 → 不上班（夜班当天不上白班）
     * 2. 有用户指定的休假需求（REQ） → 不上班
     * 3. 其他所有人都上班（包括法定休息日）
     *
     * 注意：法定休息日不是强制休息，只是计算配额的基准
     * 配额管理由 BasicRestSolver 负责
     */
    determineWorkDays(staffData, dateList, monthlyShifts, nightSchedule, personalRequests, restDays) {
        const workDays = {};

        staffData.forEach(staff => {
            const staffId = staff.id;
            workDays[staffId] = {};

            dateList.forEach(date => {
                // 1. 检查夜班（夜班当天不上白班）
                if (nightSchedule[staffId] && nightSchedule[staffId][date]) {
                    workDays[staffId][date] = 'REST';
                    return;
                }

                // 2. 检查用户指定的休假需求（REQ）
                if (personalRequests[staffId] && personalRequests[staffId][date] === 'REQ') {
                    workDays[staffId][date] = 'REST';
                    return;
                }

                // 3. 其他所有人上班（包括法定休息日）
                workDays[staffId][date] = 'WORKING';
            });
        });

        return workDays;
    },

    /**
     * ========== 阶段C：为上班的人安排职能 ==========
     * 策略：
     * 1. 每个班次每天有固定的职能需求
     * 2. 根据技能匹配人员
     * 3. 根据职能均衡原则排序
     */
    assignDailyFunctions(staffData, dateList, monthlyShifts, workDays, demandConfig, personalRequests) {
        const schedule = {};

        // 初始化 schedule
        staffData.forEach(staff => {
            schedule[staff.id] = {};
        });

        // 按日期处理
        dateList.forEach(date => {
            console.log(`[CSPSolver] 处理日期: ${date}`);

            // 为每个班次分配职能
            this.SHIFT_TYPES.forEach(shiftId => {
                // 找到这个班次的所有人员
                const shiftStaff = staffData.filter(staff =>
                    monthlyShifts[staff.id] === shiftId &&
                    workDays[staff.id] && workDays[staff.id][date] === 'WORKING'
                );

                if (shiftStaff.length === 0) {
                    console.log(`  ${shiftId}: 无人上班`);
                    return;
                }

                // 获取该班次的职能需求
                const demand = this.getShiftDemand(demandConfig, shiftId, date);
                if (!demand) {
                    console.log(`  ${shiftId}: 无职能需求`);
                    return;
                }

                console.log(`  ${shiftId}: ${shiftStaff.length}人上班，需求: ${JSON.stringify(demand.functions)}`);

                // 为这个班次的人员分配职能
                const assignments = this.assignFunctionsToShiftStaff(shiftStaff, demand, date, schedule, personalRequests);

                // 记录排班结果
                assignments.forEach(({ staffId, functionId }) => {
                    schedule[staffId][date] = `${shiftId}-${functionId}`;
                });

                console.log(`  ${shiftId}: 已分配 ${assignments.length}人`);
            });
        });

        return schedule;
    },

    /**
     * 为班次人员分配职能
     */
    assignFunctionsToShiftStaff(shiftStaff, demand, date, schedule, personalRequests) {
        const assignments = [];
        const assignedStaff = new Set();

        // 遍历所有职能需求
        Object.entries(demand.functions).forEach(([functionId, count]) => {
            if (count <= 0) return;

            // 找到具备该职能且未被分配的人员
            const candidates = shiftStaff.filter(staff => {
                if (assignedStaff.has(staff.id)) return false;
                const skills = staff.skills || [];
                return skills.includes(functionId);
            });

            if (candidates.length === 0) {
                console.warn(`    警告: 职能 ${functionId} 无人可用`);
                return;
            }

            // 按职能均衡得分排序
            const ranked = this.rankStaffByFunctionBalance(candidates, functionId, date, schedule, personalRequests);

            // 选择前 N 人
            const selected = ranked.slice(0, Math.min(count, ranked.length));

            selected.forEach(staff => {
                assignments.push({ staffId: staff.id, functionId });
                assignedStaff.add(staff.id);
            });
        });

        return assignments;
    },

    /**
     * 按职能均衡得分排序
     */
    rankStaffByFunctionBalance(staffList, functionId, date, schedule, personalRequests) {
        if (typeof FunctionBalanceManager !== 'undefined') {
            const allStaffData = staffList; // 简化：使用当前人员列表
            const requiredFunctions = { [functionId]: 1 };

            const scored = staffList.map(staff => {
                const score = FunctionBalanceManager.calculateProportionalBalanceScore(
                    staff.id,
                    requiredFunctions,
                    date,
                    schedule,
                    personalRequests,
                    allStaffData
                );
                return { ...staff, _balanceScore: score };
            });

            // 按得分降序排序（得分高的优先，即职能次数少的优先）
            scored.sort((a, b) => b._balanceScore - a._balanceScore);
            return scored;
        }

        // 如果 FunctionBalanceManager 未加载，直接返回原列表
        return staffList;
    },

    /**
     * 生成日期列表
     * @param {string} startDate - 开始日期 (YYYY-MM-DD)
     * @param {string} endDate - 结束日期 (YYYY-MM-DD)
     * @returns {Array<string>} 日期字符串数组
     */
    generateDateList(startDate, endDate) {
        const dates = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        // 使用 DateUtils.formatDate 如果可用，否则使用内联格式化
        const formatDate = typeof DateUtils !== 'undefined'
            ? DateUtils.formatDate.bind(DateUtils)
            : (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

        while (current <= end) {
            dates.push(formatDate(new Date(current)));
            current.setDate(current.getDate() + 1);
        }

        return dates;
    },

    /**
     * 获取每日人力配置
     */
    getDailyManpowerConfig() {
        if (typeof DailyManpowerManager !== 'undefined') {
            if (DailyManpowerManager.matrix && Object.keys(DailyManpowerManager.matrix).length > 0) {
                console.log('[CSPSolver] 使用DailyManpowerManager的矩阵配置');
                return DailyManpowerManager.matrix;
            }
        }

        console.warn('[CSPSolver] DailyManpowerManager未加载或为空，使用默认配置');
        return {};
    },

    /**
     * 获取指定班次的人力需求
     */
    getShiftDemand(demandConfig, shiftId, date) {
        const defaultDemands = {
            'A1': {
                min: 4,
                max: 4,
                functions: { '网': 2, '天': 0, '微': 0, '毛': 1, '银B': 1, '收': 0 }
            },
            'A': {
                min: 5,
                max: 5,
                functions: { '网': 2, '天': 1, '微': 1, '毛': 0, '银B': 0, '追': 1 }
            },
            'A2': {
                min: 4,
                max: 4,
                functions: { '网': 2, '天': 1, '微': 1, '毛': 0, '银B': 0, '收': 0 }
            },
            'B1': {
                min: 4,
                max: 4,
                functions: { '网': 2, '天': 0, '微': 1, '毛': 0, '银B': 1, '追': 0 }
            },
            'B2': {
                min: 6,
                max: 6,
                functions: { '网': 2, '天': 1, '微': 1, '毛': 1, '银B': 1, '追': 1 }
            }
        };

        return defaultDemands[shiftId] || null;
    },

    /**
     * 获取相对日期
     */
    getRelativeDate(date, offset) {
        const d = new Date(date);
        d.setDate(d.getDate() + offset);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};
