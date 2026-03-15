/**
 * MIP 白班求解器（方案A）
 *
 * 说明：
 * 1. 复用 CSPSolver 的数据标准化、月度固定班别分配、职能分配与统计口径
 * 2. 采用 GLPK 建模 y(i,d) 二进制排班（固定月班别后，按日是否上白班）
 * 3. 硬约束优先：每日最低人力 + 每人目标白班天数区间 + 大夜/休假阻塞
 * 4. 软约束优化：连续上/休班上限违例、碎片化（切换次数）、短连班/短连休惩罚
 */

const MIPDayShiftSolver = {
    SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2'],

    defaultConfig: {
        preferredMinWorkDays: 4,
        preferredMinRestDays: 4,
        monthlyShiftChangePenalty: 60,
        maxExtraDayPerStaff: 1,
        // 应急补位允许突破 maxExtraDayPerStaff 的附加上限（默认 0，表示不突破）
        maxEmergencyExtraDayPerStaff: 0,
        staffExtraAllowanceDays: {},
        useStaffExtraAllowanceOnly: false,
        // 当启用 staffExtraAllowanceDays 时，将其作为“应上白班天数”的强制增量
        enforcePlannedExtraAsTarget: true,
        relaxLevels: [
            { name: 'L0', minWork: 3, maxWork: 6, minRest: 2, maxRest: 4 }
        ],
        mip: {
            timeLimitSec: 25,
            mipGap: 0.01,
            msgLevel: 0,
            enableFunctionAssignmentMIP: true,
            functionTimeLimitSec: 14,
            functionMipGap: 0.02,
            functionMajorViolationWeight: 2400,
            functionMajorDiffWeight: 160,
            functionBalanceViolationWeight: 780,
            functionBalanceDiffWeight: 45,
            functionTargetDeviationWeight: 16,
            functionMajorTargetDeviationWeight: 56,
            functionChangePenalty: 3,
            maxRepairSteps: 220,
            objectiveWeights: {
                shortage: 1000000,
                underTarget: 450000,
                overTarget: 280000,
                windowViolation: 9000,
                transition: 45,
                shortWork1: 140,
                shortWork2: 90,
                shortWork3: 45,
                shortRest1: 120
            }
        }
    },

    _glpkInstance: null,
    _glpkPromise: null,

    async loadGLPK() {
        if (this._glpkInstance) return this._glpkInstance;
        if (!this._glpkPromise) {
            this._glpkPromise = (async () => {
                const moduleUrls = [];
                if (typeof window !== 'undefined' && window.location) {
                    moduleUrls.push(new URL('/node_modules/glpk.js/dist/index.js', window.location.origin).href);
                }
                moduleUrls.push('/node_modules/glpk.js/dist/index.js');

                let lastError = null;
                for (let i = 0; i < moduleUrls.length; i++) {
                    const url = moduleUrls[i];
                    try {
                        const mod = await import(url);
                        const factory = mod && mod.default ? mod.default : null;
                        if (typeof factory !== 'function') {
                            throw new Error('GLPK 模块缺少默认工厂函数');
                        }
                        const glpk = await factory();
                        if (!glpk || typeof glpk.solve !== 'function') {
                            throw new Error('GLPK 初始化失败：solve 不可用');
                        }
                        return glpk;
                    } catch (error) {
                        lastError = error;
                    }
                }
                throw new Error(`加载 GLPK 失败: ${lastError ? lastError.message : '未知错误'}`);
            })().catch((error) => {
                this._glpkPromise = null;
                throw error;
            });
        }
        this._glpkInstance = await this._glpkPromise;
        return this._glpkInstance;
    },

    buildConfig(rules) {
        const fromRules = (rules && typeof rules === 'object') ? rules : {};
        let merged;
        if (typeof CSPSolver !== 'undefined' && CSPSolver && typeof CSPSolver.buildConfig === 'function') {
            // 先吃掉 dayShiftRules / cspSolver 的覆盖逻辑，保证口径一致
            merged = CSPSolver.buildConfig(fromRules);
        } else {
            merged = this.deepMerge(this.defaultConfig, fromRules);
        }
        merged = this.deepMerge(this.defaultConfig, merged);
        if (fromRules.mip && typeof fromRules.mip === 'object') {
            merged.mip = this.deepMerge(merged.mip || {}, fromRules.mip);
        }
        return merged;
    },

    buildExtraCapByStaff(staffList, targetDays, config) {
        if (typeof CSPSolver !== 'undefined' && CSPSolver && typeof CSPSolver.buildExtraCapByStaff === 'function') {
            return CSPSolver.buildExtraCapByStaff(staffList, targetDays, config);
        }
        const maxExtraDefault = Math.max(0, Math.floor(Number(config?.maxExtraDayPerStaff) || 0));
        const staffPlan = (config && config.staffExtraAllowanceDays && typeof config.staffExtraAllowanceDays === 'object')
            ? config.staffExtraAllowanceDays
            : {};
        const useStaffExtraOnly = config && config.useStaffExtraAllowanceOnly === true;
        const enforcePlannedExtraAsTarget = !!(useStaffExtraOnly && config && config.enforcePlannedExtraAsTarget !== false);
        const out = {};
        staffList.forEach((s) => {
            const sid = s._sid;
            const explicit = Number(staffPlan[sid]);
            if (Number.isFinite(explicit)) {
                out[sid] = enforcePlannedExtraAsTarget ? 0 : Math.max(0, Math.floor(explicit));
            } else {
                out[sid] = useStaffExtraOnly ? 0 : maxExtraDefault;
            }
        });
        return out;
    },

    getGlpkConstants(glpk) {
        const read = (k, fallback) => {
            const v = Number(glpk && glpk[k]);
            return Number.isFinite(v) ? v : fallback;
        };
        return {
            GLP_MIN: read('GLP_MIN', 1),
            GLP_MAX: read('GLP_MAX', 2),
            GLP_FR: read('GLP_FR', 1),
            GLP_LO: read('GLP_LO', 2),
            GLP_UP: read('GLP_UP', 3),
            GLP_DB: read('GLP_DB', 4),
            GLP_FX: read('GLP_FX', 5),
            GLP_MSG_OFF: read('GLP_MSG_OFF', 0),
            GLP_MSG_ERR: read('GLP_MSG_ERR', 1),
            GLP_MSG_ON: read('GLP_MSG_ON', 2),
            GLP_MSG_ALL: read('GLP_MSG_ALL', 3),
            GLP_MSG_DBG: read('GLP_MSG_DBG', 4),
            GLP_UNDEF: read('GLP_UNDEF', 1),
            GLP_FEAS: read('GLP_FEAS', 2),
            GLP_INFEAS: read('GLP_INFEAS', 3),
            GLP_NOFEAS: read('GLP_NOFEAS', 4),
            GLP_OPT: read('GLP_OPT', 5),
            GLP_UNBND: read('GLP_UNBND', 6)
        };
    },

    isFeasibleStatus(status, constants) {
        return status === constants.GLP_OPT || status === constants.GLP_FEAS;
    },

    getStatusLabel(status, constants) {
        const mapping = {};
        mapping[constants.GLP_OPT] = 'OPT';
        mapping[constants.GLP_FEAS] = 'FEAS';
        mapping[constants.GLP_UNDEF] = 'UNDEF';
        mapping[constants.GLP_INFEAS] = 'INFEAS';
        mapping[constants.GLP_NOFEAS] = 'NOFEAS';
        mapping[constants.GLP_UNBND] = 'UNBND';
        if (Object.prototype.hasOwnProperty.call(mapping, status)) {
            return mapping[status];
        }
        return String(status);
    },

    async solveMIPWithRetries({
        glpk,
        lp,
        constants,
        config,
        baseTimeSec = 25,
        phase = 'day'
    }) {
        const msglev = Number(config?.mip?.msgLevel) || constants.GLP_MSG_OFF;
        const baseGap = Math.max(0, Number(config?.mip?.mipGap) || 0);
        const baseTime = Math.max(5, Math.floor(Number(baseTimeSec) || 25));
        const retryProfiles = [
            { id: `${phase}_A0`, tmlim: baseTime, mipgap: baseGap, presol: true },
            { id: `${phase}_A1`, tmlim: Math.min(220, Math.max(baseTime + 18, Math.floor(baseTime * 1.8))), mipgap: Math.max(baseGap, 0.02), presol: true },
            { id: `${phase}_A2`, tmlim: Math.min(280, Math.max(baseTime + 40, Math.floor(baseTime * 2.5))), mipgap: Math.max(baseGap, 0.05), presol: false }
        ];
        const maxRetryProfiles = Math.min(3, Math.max(1, Math.floor(Number(config?.mip?.maxRetryProfiles) || retryProfiles.length)));
        const effectiveProfiles = retryProfiles.slice(0, maxRetryProfiles);
        const attemptLogs = [];
        let last = { solved: null, result: null, status: null, options: null };

        for (let i = 0; i < effectiveProfiles.length; i++) {
            const profile = effectiveProfiles[i];
            const options = {
                msglev,
                tmlim: profile.tmlim,
                mipgap: profile.mipgap,
                presol: profile.presol
            };
            let solved = null;
            let result = null;
            let status = null;
            let errorMessage = '';
            try {
                solved = await glpk.solve(lp, options);
                result = solved && solved.result ? solved.result : null;
                status = result ? result.status : null;
            } catch (error) {
                errorMessage = error && error.message ? error.message : String(error || 'unknown');
            }
            const feasible = this.isFeasibleStatus(status, constants);
            attemptLogs.push({
                id: profile.id,
                status,
                statusLabel: this.getStatusLabel(status, constants),
                feasible,
                options: { ...options },
                error: errorMessage || '',
                objectiveValue: Number.isFinite(Number(result && result.z)) ? Number(result.z) : null
            });
            if (feasible) {
                return {
                    solved,
                    result,
                    status,
                    isFeasible: true,
                    options,
                    attemptLogs
                };
            }
            last = { solved, result, status, options };
        }

        return {
            solved: last.solved,
            result: last.result,
            status: last.status,
            isFeasible: false,
            options: last.options,
            attemptLogs
        };
    },

    isHardBlockedSafe(sid, date, requestState, nightMap) {
        if (nightMap && nightMap[sid] && nightMap[sid][date]) return true;
        const t = requestState && requestState[sid] ? requestState[sid][date] : null;
        if (t == null || t === '') return false;
        if (typeof t === 'string') {
            const u = t.trim().toUpperCase();
            if (!u) return false;
            return u === 'REQ' || u === 'REST' || u === 'ANNUAL' || u === 'LEGAL' || u === 'SICK';
        }
        // 非字符串状态统一按阻塞处理，避免“有请求但被排班”
        return true;
    },

    sanitizeBlockedAssignments(scheduleByStaff, requestState, nightMap) {
        const out = {};
        let removed = 0;
        Object.keys(scheduleByStaff || {}).forEach((sid) => {
            out[sid] = {};
            const row = scheduleByStaff[sid] || {};
            Object.entries(row).forEach(([date, shift]) => {
                if (this.isHardBlockedSafe(sid, date, requestState, nightMap)) {
                    removed += 1;
                    return;
                }
                out[sid][date] = shift;
            });
        });
        return { schedule: out, removedBlockedAssignments: removed };
    },

    async solveMonthlyShiftAssignmentsMIP(ctx) {
        const {
            glpk,
            constants,
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            config
        } = ctx;

        const objective = new Map();
        const subjectTo = [];
        const bounds = new Map();
        const binaries = new Set();
        const xVarMap = {};
        const staffIds = staffList.map((s) => s._sid);
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

        let rowId = 0;
        const nextRowName = (prefix) => `${prefix}_${++rowId}`;
        const addObjective = (name, coef) => {
            const c = Number(coef);
            if (!Number.isFinite(c) || c === 0) return;
            objective.set(name, (objective.get(name) || 0) + c);
        };
        const setBound = (name, type, lb, ub) => {
            bounds.set(name, {
                name,
                type,
                lb: Number.isFinite(Number(lb)) ? Number(lb) : 0,
                ub: Number.isFinite(Number(ub)) ? Number(ub) : 0
            });
        };
        const addConstraint = (prefix, vars, type, lb, ub) => {
            subjectTo.push({
                name: nextRowName(prefix),
                vars: Array.isArray(vars) ? vars : [],
                bnds: {
                    type,
                    lb: Number.isFinite(Number(lb)) ? Number(lb) : 0,
                    ub: Number.isFinite(Number(ub)) ? Number(ub) : 0
                }
            });
        };

        // x(s,k): 员工s整月班别k
        staffList.forEach((staff, sIdx) => {
            const sid = staff._sid;
            xVarMap[sid] = {};
            const rowVars = [];
            const preferredShift = preferredShiftByStaff[sid] || '';
            const forcedShift = forcedShiftByStaff[sid] || '';
            this.SHIFT_TYPES.forEach((shift, kIdx) => {
                const x = `mx_${sIdx}_${kIdx}`;
                xVarMap[sid][shift] = x;
                binaries.add(x);
                rowVars.push({ name: x, coef: 1 });
                if (preferredShift && !forcedShift && shift !== preferredShift) {
                    addObjective(x, Number(config?.monthlyShiftChangePenalty) || 60);
                }
            });
            addConstraint('mx_one_shift', rowVars, constants.GLP_FX, 1, 1);
        });

        Object.keys(forcedShiftByStaff).forEach((sid) => {
            const shift = forcedShiftByStaff[sid];
            const x = xVarMap[sid] && xVarMap[sid][shift];
            if (!x) return;
            addConstraint('mx_force_shift', [{ name: x, coef: 1 }], constants.GLP_FX, 1, 1);
        });

        const demandTotals = {};
        const peakDemandByShift = {};
        this.SHIFT_TYPES.forEach((shift) => {
            demandTotals[shift] = 0;
            peakDemandByShift[shift] = 0;
        });
        dateList.forEach((date) => {
            this.SHIFT_TYPES.forEach((shift) => {
                const need = Math.max(0, Math.floor(Number(dailyMinDemand?.[date]?.[shift]) || 0));
                demandTotals[shift] += need;
                if (need > peakDemandByShift[shift]) peakDemandByShift[shift] = need;
            });
        });

        const availableCountByStaff = {};
        let totalAvailableCells = 0;
        staffIds.forEach((sid) => {
            let c = 0;
            dateList.forEach((date) => {
                const blocked = this.isHardBlockedSafe(sid, date, requestState, nightMap);
                if (!blocked) c += 1;
            });
            availableCountByStaff[sid] = c;
            totalAvailableCells += c;
        });
        const availRate = (staffIds.length > 0 && dateList.length > 0)
            ? (totalAvailableCells / (staffIds.length * dateList.length))
            : 1;
        const safeAvailRate = Math.max(0.35, Math.min(1, availRate));

        // 目标1：日期级可用覆盖缺口最小
        dateList.forEach((date, dIdx) => {
            this.SHIFT_TYPES.forEach((shift) => {
                const need = Math.max(0, Math.floor(Number(dailyMinDemand?.[date]?.[shift]) || 0));
                if (need <= 0) return;

                const u = `mu_${dIdx}_${shift}`;
                setBound(u, constants.GLP_LO, 0, 0);
                addObjective(u, 100000);

                const rowVars = [{ name: u, coef: 1 }];
                staffIds.forEach((sid) => {
                    const blocked = this.isHardBlockedSafe(sid, date, requestState, nightMap);
                    if (blocked) return;
                    rowVars.push({ name: xVarMap[sid][shift], coef: 1 });
                });
                addConstraint('mx_cov_date', rowVars, constants.GLP_LO, need, 0);
            });
        });

        // 目标2：班别月度人天容量缺口最小
        this.SHIFT_TYPES.forEach((shift, kIdx) => {
            const v = `mv_${kIdx}`;
            setBound(v, constants.GLP_LO, 0, 0);
            addObjective(v, 2500);

            const rowVars = [{ name: v, coef: 1 }];
            staffIds.forEach((sid) => {
                const t = Math.max(0, Math.floor(Number(targetDays[sid]) || 0));
                if (t <= 0) return;
                rowVars.push({ name: xVarMap[sid][shift], coef: t });
            });
            addConstraint('mx_cov_month', rowVars, constants.GLP_LO, Math.max(0, Math.floor(Number(demandTotals[shift]) || 0)), 0);
        });

        // 目标3：班别头数保底（避免峰值日明显不够）
        this.SHIFT_TYPES.forEach((shift, kIdx) => {
            const reserveNeed = Math.max(1, Math.ceil((peakDemandByShift[shift] || 0) / safeAvailRate));
            const w = `mw_${kIdx}`;
            setBound(w, constants.GLP_LO, 0, 0);
            addObjective(w, 1200);
            const rowVars = [{ name: w, coef: 1 }];
            staffIds.forEach((sid) => {
                rowVars.push({ name: xVarMap[sid][shift], coef: 1 });
            });
            addConstraint('mx_headcount', rowVars, constants.GLP_LO, reserveNeed, 0);
        });

        // 目标4：与需求比例大体一致，减少极端偏斜
        const totalDemand = this.SHIFT_TYPES.reduce((sum, shift) => sum + (demandTotals[shift] || 0), 0);
        const n = staffIds.length;
        this.SHIFT_TYPES.forEach((shift, kIdx) => {
            const ideal = totalDemand > 0 ? ((demandTotals[shift] / totalDemand) * n) : (n / this.SHIFT_TYPES.length);
            const down = `mdn_${kIdx}`;
            const up = `mup_${kIdx}`;
            setBound(down, constants.GLP_LO, 0, 0);
            setBound(up, constants.GLP_LO, 0, 0);
            addObjective(down, 8);
            addObjective(up, 8);

            const rowVars = [];
            staffIds.forEach((sid) => {
                rowVars.push({ name: xVarMap[sid][shift], coef: 1 });
            });
            // sum x + down - up = ideal
            rowVars.push({ name: down, coef: 1 });
            rowVars.push({ name: up, coef: -1 });
            addConstraint('mx_ratio', rowVars, constants.GLP_FX, ideal, ideal);
        });

        const objectiveVars = [];
        objective.forEach((coef, name) => {
            objectiveVars.push({ name, coef });
        });
        const lp = {
            name: 'monthly_shift_assign_mip',
            objective: {
                direction: constants.GLP_MIN,
                name: 'total_cost',
                vars: objectiveVars
            },
            subjectTo,
            bounds: Array.from(bounds.values()),
            binaries: Array.from(binaries)
        };

        const solvePack = await this.solveMIPWithRetries({
            glpk,
            lp,
            constants,
            config,
            baseTimeSec: Math.max(5, Math.floor((Number(config?.mip?.timeLimitSec) || 25) * 0.5)),
            phase: 'monthly'
        });
        const solved = solvePack.solved;
        const result = solvePack.result;
        const status = solvePack.status;
        const isFeasible = solvePack.isFeasible === true;
        if (!isFeasible) {
            const trace = (solvePack.attemptLogs || [])
                .map((item) => `${item.id}:${item.statusLabel}`)
                .join(',');
            throw new Error(`月班别MIP未得到可行解，status=${status}(${this.getStatusLabel(status, constants)}),attempts=${trace}`);
        }

        const vars = result.vars || {};
        const assignment = {};
        staffIds.forEach((sid) => {
            let pick = this.SHIFT_TYPES[0];
            let best = -Infinity;
            this.SHIFT_TYPES.forEach((shift) => {
                const v = Number(vars[xVarMap[sid][shift]]) || 0;
                if (v > best) {
                    best = v;
                    pick = shift;
                }
            });
            assignment[sid] = pick;
        });

        return {
            assignment,
            status,
            objectiveValue: Number.isFinite(Number(result.z)) ? Number(result.z) : null,
            forcedCount: Object.keys(forcedShiftByStaff).length,
            attemptLogs: solvePack.attemptLogs || [],
            options: solvePack.options || null
        };
    },

    buildModel(ctx) {
        const {
            constants,
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            monthlyShiftAssignments,
            extraCapByStaff,
            relax,
            config
        } = ctx;

        const nDays = dateList.length;
        const weights = (config?.mip?.objectiveWeights && typeof config.mip.objectiveWeights === 'object')
            ? config.mip.objectiveWeights
            : {};

        const objective = new Map();
        const subjectTo = [];
        const bounds = new Map();
        const binaries = new Set();

        let rowId = 0;
        const nextRowName = (prefix) => `${prefix}_${++rowId}`;

        const addObjective = (varName, coef) => {
            const c = Number(coef);
            if (!Number.isFinite(c) || c === 0) return;
            objective.set(varName, (objective.get(varName) || 0) + c);
        };

        const setBound = (name, type, lb, ub) => {
            bounds.set(name, {
                name,
                type,
                lb: Number.isFinite(Number(lb)) ? Number(lb) : 0,
                ub: Number.isFinite(Number(ub)) ? Number(ub) : 0
            });
        };

        const addConstraint = (prefix, vars, type, lb, ub) => {
            subjectTo.push({
                name: nextRowName(prefix),
                vars: Array.isArray(vars) ? vars : [],
                bnds: {
                    type,
                    lb: Number.isFinite(Number(lb)) ? Number(lb) : 0,
                    ub: Number.isFinite(Number(ub)) ? Number(ub) : 0
                }
            });
        };

        const yVarMap = {};
        const staffIds = staffList.map((s) => s._sid);
        const staffIndex = {};
        staffIds.forEach((sid, i) => { staffIndex[sid] = i; });

        // y(i,d) 二进制：该日是否上白班
        staffList.forEach((staff, sIdx) => {
            const sid = staff._sid;
            yVarMap[sid] = {};
            dateList.forEach((date, dIdx) => {
                const y = `y_${sIdx}_${dIdx}`;
                yVarMap[sid][date] = y;
                binaries.add(y);
                if (this.isHardBlockedSafe(sid, date, requestState, nightMap)) {
                    setBound(y, constants.GLP_FX, 0, 0);
                }
            });
        });

        // 覆盖约束：sum(y in shift) + shortage >= demand
        const shortageVarMap = {};
        dateList.forEach((date, dIdx) => {
            shortageVarMap[date] = {};
            this.SHIFT_TYPES.forEach((shift) => {
                const need = Number(dailyMinDemand?.[date]?.[shift]) || 0;
                if (need <= 0) return;

                const shortVar = `sh_${dIdx}_${shift}`;
                shortageVarMap[date][shift] = shortVar;
                setBound(shortVar, constants.GLP_LO, 0, 0);
                addObjective(shortVar, Number(weights.shortage) || 1000000);

                const rowVars = [{ name: shortVar, coef: 1 }];
                staffIds.forEach((sid) => {
                    if ((monthlyShiftAssignments[sid] || '') !== shift) return;
                    rowVars.push({ name: yVarMap[sid][date], coef: 1 });
                });
                addConstraint('cov', rowVars, constants.GLP_LO, need, 0);
            });
        });

        // 每人目标白班天数区间：target <= sum(y) <= target + cap
        staffList.forEach((staff, sIdx) => {
            const sid = staff._sid;
            const target = Math.max(0, Math.floor(Number(targetDays[sid]) || 0));
            const cap = Math.max(0, Math.floor(Number(extraCapByStaff[sid]) || 0));
            const dayVars = dateList.map((d) => ({ name: yVarMap[sid][d], coef: 1 }));
            const available = dateList.reduce((sum, d) => {
                return sum + (this.isHardBlockedSafe(sid, d, requestState, nightMap) ? 0 : 1);
            }, 0);
            const hardLower = Math.max(0, Math.min(target, available));

            // 硬下界：可行范围内必须满足每人最少白班天数，避免个别人员被长期欠排
            addConstraint('target_lb_hard', dayVars, constants.GLP_LO, hardLower, 0);

            const underVar = `ud_${sIdx}`;
            setBound(underVar, constants.GLP_LO, 0, 0);
            addObjective(underVar, Number(weights.underTarget) || 450000);
            addConstraint('target_lb', dayVars.concat([{ name: underVar, coef: 1 }]), constants.GLP_LO, target, 0);

            const overVar = `ov_${sIdx}`;
            setBound(overVar, constants.GLP_LO, 0, 0);
            addObjective(overVar, Number(weights.overTarget) || 280000);
            addConstraint('target_ub', dayVars.concat([{ name: overVar, coef: -1 }]), constants.GLP_UP, 0, target + cap);
        });

        const maxWork = Math.max(1, Math.floor(Number(relax?.maxWork) || 6));
        const maxRest = Math.max(1, Math.floor(Number(relax?.maxRest) || 4));
        const prefWork = Math.max(maxWork >= 1 ? 1 : 0, Math.floor(Number(config?.preferredMinWorkDays) || 4));
        const prefRest = Math.max(1, Math.floor(Number(config?.preferredMinRestDays) || 4));

        // 连续上班上限软约束：任意 maxWork+1 窗口内工作数 <= maxWork + slack
        if (nDays >= maxWork + 1) {
            staffList.forEach((staff, sIdx) => {
                const sid = staff._sid;
                for (let start = 0; start <= nDays - (maxWork + 1); start++) {
                    const v = `wov_${sIdx}_${start}`;
                    setBound(v, constants.GLP_LO, 0, 0);
                    addObjective(v, Number(weights.windowViolation) || 9000);
                    const rowVars = [{ name: v, coef: -1 }];
                    for (let k = start; k < start + maxWork + 1; k++) {
                        rowVars.push({ name: yVarMap[sid][dateList[k]], coef: 1 });
                    }
                    addConstraint('work_win', rowVars, constants.GLP_UP, 0, maxWork);
                }
            });
        }

        // 连续休息上限软约束：任意 maxRest+1 窗口内至少有 1 天上班（否则 slack）
        if (nDays >= maxRest + 1) {
            staffList.forEach((staff, sIdx) => {
                const sid = staff._sid;
                for (let start = 0; start <= nDays - (maxRest + 1); start++) {
                    const v = `rov_${sIdx}_${start}`;
                    setBound(v, constants.GLP_LO, 0, 0);
                    addObjective(v, Number(weights.windowViolation) || 9000);
                    const rowVars = [{ name: v, coef: 1 }];
                    for (let k = start; k < start + maxRest + 1; k++) {
                        rowVars.push({ name: yVarMap[sid][dateList[k]], coef: 1 });
                    }
                    addConstraint('rest_win', rowVars, constants.GLP_LO, 1, 0);
                }
            });
        }

        // 碎片化惩罚：惩罚相邻日期状态切换 |y_d - y_{d-1}|
        if (nDays >= 2) {
            staffList.forEach((staff, sIdx) => {
                const sid = staff._sid;
                for (let d = 1; d < nDays; d++) {
                    const trans = `tr_${sIdx}_${d}`;
                    setBound(trans, constants.GLP_DB, 0, 1);
                    addObjective(trans, Number(weights.transition) || 45);

                    const yPrev = yVarMap[sid][dateList[d - 1]];
                    const yCurr = yVarMap[sid][dateList[d]];
                    addConstraint('tr_pos', [
                        { name: trans, coef: 1 },
                        { name: yCurr, coef: -1 },
                        { name: yPrev, coef: 1 }
                    ], constants.GLP_LO, 0, 0);
                    addConstraint('tr_neg', [
                        { name: trans, coef: 1 },
                        { name: yCurr, coef: 1 },
                        { name: yPrev, coef: -1 }
                    ], constants.GLP_LO, 0, 0);
                }
            });
        }

        // 福利偏好：尽量避免短连班（长度 1/2/3）和单休（长度 1）
        // 只对“中间段”建模，边界段不惩罚，避免过多附加变量。
        staffList.forEach((staff, sIdx) => {
            const sid = staff._sid;
            if (nDays >= 3 && prefWork >= 2) {
                for (let d = 1; d <= nDays - 2; d++) {
                    const v = `sw1_${sIdx}_${d}`;
                    setBound(v, constants.GLP_DB, 0, 1);
                    addObjective(v, Number(weights.shortWork1) || 140);
                    // v >= y[d] - y[d-1] - y[d+1]
                    addConstraint('sw1', [
                        { name: v, coef: 1 },
                        { name: yVarMap[sid][dateList[d]], coef: -1 },
                        { name: yVarMap[sid][dateList[d - 1]], coef: 1 },
                        { name: yVarMap[sid][dateList[d + 1]], coef: 1 }
                    ], constants.GLP_LO, 0, 0);
                }
            }

            if (nDays >= 4 && prefWork >= 3) {
                for (let d = 1; d <= nDays - 3; d++) {
                    const v = `sw2_${sIdx}_${d}`;
                    setBound(v, constants.GLP_DB, 0, 1);
                    addObjective(v, Number(weights.shortWork2) || 90);
                    // v >= y[d] + y[d+1] - y[d-1] - y[d+2] - 1
                    addConstraint('sw2', [
                        { name: v, coef: 1 },
                        { name: yVarMap[sid][dateList[d]], coef: -1 },
                        { name: yVarMap[sid][dateList[d + 1]], coef: -1 },
                        { name: yVarMap[sid][dateList[d - 1]], coef: 1 },
                        { name: yVarMap[sid][dateList[d + 2]], coef: 1 }
                    ], constants.GLP_LO, -1, 0);
                }
            }

            if (nDays >= 5 && prefWork >= 4) {
                for (let d = 1; d <= nDays - 4; d++) {
                    const v = `sw3_${sIdx}_${d}`;
                    setBound(v, constants.GLP_DB, 0, 1);
                    addObjective(v, Number(weights.shortWork3) || 45);
                    // v >= y[d] + y[d+1] + y[d+2] - y[d-1] - y[d+3] - 2
                    addConstraint('sw3', [
                        { name: v, coef: 1 },
                        { name: yVarMap[sid][dateList[d]], coef: -1 },
                        { name: yVarMap[sid][dateList[d + 1]], coef: -1 },
                        { name: yVarMap[sid][dateList[d + 2]], coef: -1 },
                        { name: yVarMap[sid][dateList[d - 1]], coef: 1 },
                        { name: yVarMap[sid][dateList[d + 3]], coef: 1 }
                    ], constants.GLP_LO, -2, 0);
                }
            }

            if (nDays >= 3 && prefRest >= 2) {
                for (let d = 1; d <= nDays - 2; d++) {
                    const v = `sr1_${sIdx}_${d}`;
                    setBound(v, constants.GLP_DB, 0, 1);
                    addObjective(v, Number(weights.shortRest1) || 120);
                    // v >= (1-y[d]) - (1-y[d-1]) - (1-y[d+1]) = y[d-1] + y[d+1] - y[d] - 1
                    addConstraint('sr1', [
                        { name: v, coef: 1 },
                        { name: yVarMap[sid][dateList[d - 1]], coef: -1 },
                        { name: yVarMap[sid][dateList[d + 1]], coef: -1 },
                        { name: yVarMap[sid][dateList[d]], coef: 1 }
                    ], constants.GLP_LO, -1, 0);
                }
            }
        });

        const objectiveVars = [];
        objective.forEach((coef, name) => {
            objectiveVars.push({ name, coef });
        });

        return {
            lp: {
                name: 'day_shift_mip',
                objective: {
                    direction: constants.GLP_MIN,
                    name: 'total_cost',
                    vars: objectiveVars
                },
                subjectTo,
                bounds: Array.from(bounds.values()),
                binaries: Array.from(binaries)
            },
            yVarMap,
            staffIndex,
            shortageVarMap
        };
    },

    decodeScheduleFromSolution(staffList, dateList, monthlyShiftAssignments, yVarMap, vars) {
        const scheduleByStaff = {};
        staffList.forEach((staff) => {
            const sid = staff._sid;
            const shift = monthlyShiftAssignments[sid] || this.SHIFT_TYPES[0];
            scheduleByStaff[sid] = {};
            dateList.forEach((date) => {
                const v = Number(vars[yVarMap[sid][date]]) || 0;
                if (v >= 0.5) {
                    scheduleByStaff[sid][date] = shift;
                }
            });
        });
        return scheduleByStaff;
    },

    buildExtraDayUsage(scheduleByStaff, targetDays) {
        const usage = {};
        let total = 0;
        Object.keys(scheduleByStaff || {}).forEach((sid) => {
            const assigned = Object.keys(scheduleByStaff[sid] || {}).length;
            const target = Math.max(0, Math.floor(Number(targetDays[sid]) || 0));
            const extra = Math.max(0, assigned - target);
            if (extra > 0) {
                usage[sid] = extra;
                total += extra;
            }
        });
        return { usage, total };
    },

    buildFunctionSlots(staffList, dateList, scheduleByStaff, baseFunctionScheduleByStaff, functionTypes) {
        const fnSet = new Set(Array.isArray(functionTypes) ? functionTypes : []);
        const out = [];
        staffList.forEach((staff, sIdx) => {
            const sid = staff._sid;
            dateList.forEach((date, dIdx) => {
                const shift = scheduleByStaff?.[sid]?.[date];
                if (!this.SHIFT_TYPES.includes(shift)) return;
                const originalFunction = String(baseFunctionScheduleByStaff?.[sid]?.[date] || '').trim();
                const fallbackFn = functionTypes[(sIdx + dIdx) % Math.max(1, functionTypes.length)] || functionTypes[0] || '网';
                out.push({
                    sid,
                    date,
                    shift,
                    originalFunction: fnSet.has(originalFunction) ? originalFunction : fallbackFn
                });
            });
        });
        return out;
    },

    rebuildFunctionArtifacts({ assignments = [], dateList = [], staffList = [], functionTypes = [] }) {
        const fnList = Array.isArray(functionTypes) && functionTypes.length > 0
            ? functionTypes.slice()
            : ['网', '天', '微', '追', '收', '综', '银B', '毛', '星'];
        const dailyFunctionStats = {};
        const functionScheduleByStaff = {};
        const staffFunctionCounts = {};
        const staffAssignmentCount = {};

        dateList.forEach((date) => {
            dailyFunctionStats[date] = {};
            fnList.forEach((f) => {
                dailyFunctionStats[date][f] = 0;
            });
        });
        staffList.forEach((staff) => {
            const sid = staff._sid;
            functionScheduleByStaff[sid] = {};
            staffFunctionCounts[sid] = {};
            staffAssignmentCount[sid] = 0;
            fnList.forEach((f) => {
                staffFunctionCounts[sid][f] = 0;
            });
        });

        assignments.forEach((slot) => {
            const sid = String(slot.sid || '').trim();
            const date = String(slot.date || '').trim();
            const fn = String(slot.function || '').trim();
            if (!sid || !date || !fn || !staffFunctionCounts[sid] || !dailyFunctionStats[date] || !Object.prototype.hasOwnProperty.call(dailyFunctionStats[date], fn)) {
                return;
            }
            functionScheduleByStaff[sid][date] = fn;
            staffFunctionCounts[sid][fn] += 1;
            staffAssignmentCount[sid] += 1;
            dailyFunctionStats[date][fn] += 1;
        });

        return {
            dailyFunctionStats,
            functionScheduleByStaff,
            staffFunctionCounts,
            staffAssignmentCount
        };
    },

    computeFunctionImbalanceMetrics({
        staffFunctionCounts = {},
        staffAssignmentCount = {},
        functionBalanceM = 2,
        majorFunctionPersonalRatioEnabled = true
    }) {
        const majorFns = Array.isArray(CSPSolver?.MAJOR_FUNCTIONS) && CSPSolver.MAJOR_FUNCTIONS.length > 0
            ? CSPSolver.MAJOR_FUNCTIONS.slice()
            : ['网', '天', '微'];
        const balanceFns = Array.isArray(CSPSolver?.BALANCE_FUNCTIONS) && CSPSolver.BALANCE_FUNCTIONS.length > 0
            ? CSPSolver.BALANCE_FUNCTIONS.slice()
            : ['追', '收', '综', '银B', '毛', '星'];
        const metrics = {
            majorViolationStaff: 0,
            majorViolationTotal: 0,
            balanceViolationStaff: 0,
            balanceViolationTotal: 0
        };

        Object.keys(staffFunctionCounts || {}).forEach((sid) => {
            const cnt = staffFunctionCounts[sid] || {};
            const total = Math.max(0, Math.floor(Number(staffAssignmentCount?.[sid]) || 0));
            if (majorFunctionPersonalRatioEnabled !== false) {
                const majorVals = majorFns.map((f) => Math.max(0, Math.floor(Number(cnt[f]) || 0)));
                const majorDiff = majorVals.length > 0 ? (Math.max(...majorVals) - Math.min(...majorVals)) : 0;
                const majorLimit = typeof CSPSolver?.getStaffMajorFunctionBalanceLimit === 'function'
                    ? Math.max(0, Math.floor(Number(CSPSolver.getStaffMajorFunctionBalanceLimit(total)) || 0))
                    : 3;
                if (majorDiff > majorLimit) {
                    metrics.majorViolationStaff += 1;
                    metrics.majorViolationTotal += (majorDiff - majorLimit);
                }
            }

            const balVals = balanceFns.map((f) => Math.max(0, Math.floor(Number(cnt[f]) || 0)));
            const balDiff = balVals.length > 0 ? (Math.max(...balVals) - Math.min(...balVals)) : 0;
            const balLimit = typeof CSPSolver?.getStaffFunctionBalanceLimit === 'function'
                ? Math.max(0, Math.floor(Number(CSPSolver.getStaffFunctionBalanceLimit(total, functionBalanceM)) || 0))
                : Math.max(0, Math.floor(Number(functionBalanceM) || 0));
            if (balDiff > balLimit) {
                metrics.balanceViolationStaff += 1;
                metrics.balanceViolationTotal += (balDiff - balLimit);
            }
        });

        return metrics;
    },

    rebuildFunctionBalanceWarnings(
        baseWarnings,
        staffFunctionCounts,
        staffAssignmentCount,
        functionBalanceM,
        majorFunctionPersonalRatioEnabled = true,
        assignments = [],
        shiftBalanceSixTotalTolerance = 1
    ) {
        const warnings = (Array.isArray(baseWarnings) ? baseWarnings : [])
            .filter((w) => !/六类职能差异超阈值|网天微差异超阈值|班别.*六类总量偏差超阈值|同班别六类职能总量均衡修复/.test(String(w || '')));
        const majorFns = Array.isArray(CSPSolver?.MAJOR_FUNCTIONS) && CSPSolver.MAJOR_FUNCTIONS.length > 0
            ? CSPSolver.MAJOR_FUNCTIONS.slice()
            : ['网', '天', '微'];
        const balanceFns = Array.isArray(CSPSolver?.BALANCE_FUNCTIONS) && CSPSolver.BALANCE_FUNCTIONS.length > 0
            ? CSPSolver.BALANCE_FUNCTIONS.slice()
            : ['追', '收', '综', '银B', '毛', '星'];

        Object.keys(staffFunctionCounts || {}).sort((a, b) => String(a).localeCompare(String(b))).forEach((sid) => {
            const cnt = staffFunctionCounts[sid] || {};
            const total = Math.max(0, Math.floor(Number(staffAssignmentCount?.[sid]) || 0));

            const balVals = balanceFns.map((f) => Math.max(0, Math.floor(Number(cnt[f]) || 0)));
            const balMax = balVals.length > 0 ? Math.max(...balVals) : 0;
            const balMin = balVals.length > 0 ? Math.min(...balVals) : 0;
            const balLimit = typeof CSPSolver?.getStaffFunctionBalanceLimit === 'function'
                ? Math.max(0, Math.floor(Number(CSPSolver.getStaffFunctionBalanceLimit(total, functionBalanceM)) || 0))
                : Math.max(0, Math.floor(Number(functionBalanceM) || 0));
            if (balMax - balMin > balLimit) {
                warnings.push(`员工${sid}六类职能差异超阈值: ${balMax - balMin} > ${balLimit}`);
            }

            if (majorFunctionPersonalRatioEnabled !== false) {
                const majorVals = majorFns.map((f) => Math.max(0, Math.floor(Number(cnt[f]) || 0)));
                const majorMax = majorVals.length > 0 ? Math.max(...majorVals) : 0;
                const majorMin = majorVals.length > 0 ? Math.min(...majorVals) : 0;
                const majorLimit = typeof CSPSolver?.getStaffMajorFunctionBalanceLimit === 'function'
                    ? Math.max(0, Math.floor(Number(CSPSolver.getStaffMajorFunctionBalanceLimit(total)) || 0))
                    : 3;
                if (majorMax - majorMin > majorLimit) {
                    warnings.push(`员工${sid}网天微差异超阈值: ${majorMax - majorMin} > ${majorLimit}`);
                }
            }
        });

        if (typeof CSPSolver?.collectShiftStaffBalanceFunctionTotalStats === 'function') {
            const shiftStats = CSPSolver.collectShiftStaffBalanceFunctionTotalStats({
                staffFunctionCounts,
                staffAssignmentCount,
                allAssignments: assignments,
                shiftBalanceSixTotalTolerance: Math.max(0, Math.floor(Number(shiftBalanceSixTotalTolerance) || 1))
            });
            if (shiftStats && Number(shiftStats.violationTotal || 0) > 0) {
                (shiftStats.violations || []).slice(0, 10).forEach((v) => {
                    warnings.push(
                        `班别${v.shift} 员工${v.sid}六类总量偏差超阈值: ${v.actual}/${v.target} (diff=${v.diff}, tol=${v.tolerance})`
                    );
                });
            }
        }

        return warnings;
    },

    async optimizeFunctionAssignmentsMIP({
        glpk,
        constants,
        config,
        staffList,
        dateList,
        scheduleByStaff,
        baseFunctionResult
    }) {
        if (config?.mip?.enableFunctionAssignmentMIP === false) {
            return { applied: false, reason: 'disabled' };
        }
        const functionTypes = Array.isArray(CSPSolver?.FUNCTION_TYPES) && CSPSolver.FUNCTION_TYPES.length > 0
            ? CSPSolver.FUNCTION_TYPES.slice()
            : ['网', '天', '微', '追', '收', '综', '银B', '毛', '星'];
        const majorFns = Array.isArray(CSPSolver?.MAJOR_FUNCTIONS) && CSPSolver.MAJOR_FUNCTIONS.length > 0
            ? CSPSolver.MAJOR_FUNCTIONS.slice()
            : ['网', '天', '微'];
        const balanceFns = Array.isArray(CSPSolver?.BALANCE_FUNCTIONS) && CSPSolver.BALANCE_FUNCTIONS.length > 0
            ? CSPSolver.BALANCE_FUNCTIONS.slice()
            : ['追', '收', '综', '银B', '毛', '星'];

        const baseSchedule = baseFunctionResult?.functionScheduleByStaff || {};
        const slots = this.buildFunctionSlots(staffList, dateList, scheduleByStaff, baseSchedule, functionTypes);
        if (slots.length === 0) {
            return { applied: false, reason: 'no_slots' };
        }

        const baselineAssignments = slots.map((slot) => ({
            sid: slot.sid,
            date: slot.date,
            shift: slot.shift,
            function: slot.originalFunction
        }));
        const baselineArtifacts = this.rebuildFunctionArtifacts({
            assignments: baselineAssignments,
            dateList,
            staffList,
            functionTypes
        });
        const baseDailyTargets = baselineArtifacts.dailyFunctionStats;
        const staffFunctionTargets = baseFunctionResult?.staffFunctionTargets || {};
        const functionBalanceM = Math.max(0, Math.floor(Number(config?.functionBalanceM) || 2));
        const majorFunctionPersonalRatioEnabled = config?.majorFunctionPersonalRatioEnabled !== false;

        const objective = new Map();
        const subjectTo = [];
        const bounds = new Map();
        const binaries = new Set();
        let rowId = 0;
        const nextRowName = (prefix) => `${prefix}_${++rowId}`;
        const addObjective = (name, coef) => {
            const c = Number(coef);
            if (!Number.isFinite(c) || c === 0) return;
            objective.set(name, (objective.get(name) || 0) + c);
        };
        const setBound = (name, type, lb, ub) => {
            bounds.set(name, {
                name,
                type,
                lb: Number.isFinite(Number(lb)) ? Number(lb) : 0,
                ub: Number.isFinite(Number(ub)) ? Number(ub) : 0
            });
        };
        const addConstraint = (prefix, vars, type, lb, ub) => {
            subjectTo.push({
                name: nextRowName(prefix),
                vars: Array.isArray(vars) ? vars : [],
                bnds: {
                    type,
                    lb: Number.isFinite(Number(lb)) ? Number(lb) : 0,
                    ub: Number.isFinite(Number(ub)) ? Number(ub) : 0
                }
            });
        };

        const zVarMap = [];
        const slotsByDate = {};
        const slotsByStaff = {};
        const staffFnVars = {};
        staffList.forEach((staff) => {
            const sid = staff._sid;
            slotsByStaff[sid] = [];
            staffFnVars[sid] = {};
            functionTypes.forEach((f) => {
                staffFnVars[sid][f] = [];
            });
        });
        dateList.forEach((date) => {
            slotsByDate[date] = [];
        });

        const changePenalty = Math.max(0, Number(config?.mip?.functionChangePenalty) || 0);

        slots.forEach((slot, idx) => {
            zVarMap[idx] = {};
            slotsByDate[slot.date].push(idx);
            slotsByStaff[slot.sid].push(idx);
            const oneRow = [];
            functionTypes.forEach((fn, fIdx) => {
                const name = `fz_${idx}_${fIdx}`;
                zVarMap[idx][fn] = name;
                binaries.add(name);
                oneRow.push({ name, coef: 1 });
                staffFnVars[slot.sid][fn].push({ name, coef: 1 });
                if (fn !== slot.originalFunction && changePenalty > 0) {
                    addObjective(name, changePenalty);
                }
            });
            addConstraint('func_slot_one', oneRow, constants.GLP_FX, 1, 1);
        });

        dateList.forEach((date) => {
            const daySlotIdx = slotsByDate[date] || [];
            functionTypes.forEach((fn) => {
                const target = Math.max(0, Math.floor(Number(baseDailyTargets?.[date]?.[fn]) || 0));
                const row = [];
                daySlotIdx.forEach((slotIdx) => {
                    row.push({ name: zVarMap[slotIdx][fn], coef: 1 });
                });
                addConstraint('func_day_target', row, constants.GLP_FX, target, target);
            });
        });

        const majorViolationWeight = majorFunctionPersonalRatioEnabled
            ? Math.max(0, Number(config?.mip?.functionMajorViolationWeight) || 0)
            : 0;
        const majorDiffWeight = majorFunctionPersonalRatioEnabled
            ? Math.max(0, Number(config?.mip?.functionMajorDiffWeight) || 0)
            : 0;
        const balanceViolationWeight = Math.max(0, Number(config?.mip?.functionBalanceViolationWeight) || 0);
        const balanceDiffWeight = Math.max(0, Number(config?.mip?.functionBalanceDiffWeight) || 0);
        const targetDeviationWeight = Math.max(0, Number(config?.mip?.functionTargetDeviationWeight) || 0);
        const majorTargetDeviationWeight = majorFunctionPersonalRatioEnabled
            ? Math.max(
                0,
                Number(config?.mip?.functionMajorTargetDeviationWeight)
                || (targetDeviationWeight > 0 ? (targetDeviationWeight * 3.5) : 56)
            )
            : 0;

        staffList.forEach((staff, sIdx) => {
            const sid = staff._sid;
            const total = Math.max(0, Math.floor(Number(slotsByStaff[sid]?.length) || 0));
            if (total <= 0) return;

            if (majorFunctionPersonalRatioEnabled) {
                const majorMax = `f_mx_max_${sIdx}`;
                const majorMin = `f_mx_min_${sIdx}`;
                const majorOver = `f_mx_ov_${sIdx}`;
                setBound(majorMax, constants.GLP_DB, 0, total);
                setBound(majorMin, constants.GLP_DB, 0, total);
                setBound(majorOver, constants.GLP_LO, 0, 0);
                if (majorDiffWeight > 0) {
                    addObjective(majorMax, majorDiffWeight);
                    addObjective(majorMin, -majorDiffWeight);
                }
                if (majorViolationWeight > 0) {
                    addObjective(majorOver, majorViolationWeight);
                }
                majorFns.forEach((fn) => {
                    const countVars = staffFnVars[sid][fn] || [];
                    addConstraint('f_mx_max', countVars.concat([{ name: majorMax, coef: -1 }]), constants.GLP_UP, 0, 0);
                    addConstraint('f_mx_min', countVars.concat([{ name: majorMin, coef: -1 }]), constants.GLP_LO, 0, 0);
                });
                const majorLimit = typeof CSPSolver?.getStaffMajorFunctionBalanceLimit === 'function'
                    ? Math.max(0, Math.floor(Number(CSPSolver.getStaffMajorFunctionBalanceLimit(total)) || 0))
                    : 3;
                addConstraint('f_mx_lim', [
                    { name: majorMax, coef: 1 },
                    { name: majorMin, coef: -1 },
                    { name: majorOver, coef: -1 }
                ], constants.GLP_UP, 0, majorLimit);
            }

            const balMax = `f_bl_max_${sIdx}`;
            const balMin = `f_bl_min_${sIdx}`;
            const balOver = `f_bl_ov_${sIdx}`;
            setBound(balMax, constants.GLP_DB, 0, total);
            setBound(balMin, constants.GLP_DB, 0, total);
            setBound(balOver, constants.GLP_LO, 0, 0);
            if (balanceDiffWeight > 0) {
                addObjective(balMax, balanceDiffWeight);
                addObjective(balMin, -balanceDiffWeight);
            }
            if (balanceViolationWeight > 0) {
                addObjective(balOver, balanceViolationWeight);
            }
            balanceFns.forEach((fn) => {
                const countVars = staffFnVars[sid][fn] || [];
                addConstraint('f_bl_max', countVars.concat([{ name: balMax, coef: -1 }]), constants.GLP_UP, 0, 0);
                addConstraint('f_bl_min', countVars.concat([{ name: balMin, coef: -1 }]), constants.GLP_LO, 0, 0);
            });
            const balLimit = typeof CSPSolver?.getStaffFunctionBalanceLimit === 'function'
                ? Math.max(0, Math.floor(Number(CSPSolver.getStaffFunctionBalanceLimit(total, functionBalanceM)) || 0))
                : Math.max(0, functionBalanceM);
            addConstraint('f_bl_lim', [
                { name: balMax, coef: 1 },
                { name: balMin, coef: -1 },
                { name: balOver, coef: -1 }
            ], constants.GLP_UP, 0, balLimit);

            if (targetDeviationWeight > 0 || majorTargetDeviationWeight > 0) {
                functionTypes.forEach((fn, fIdx) => {
                    const target = Math.max(0, Math.floor(Number(staffFunctionTargets?.[sid]?.[fn]) || 0));
                    const devPos = `f_tdp_${sIdx}_${fIdx}`;
                    const devNeg = `f_tdn_${sIdx}_${fIdx}`;
                    setBound(devPos, constants.GLP_LO, 0, 0);
                    setBound(devNeg, constants.GLP_LO, 0, 0);
                    const isMajorFn = majorFns.includes(fn);
                    const fnDeviationWeight = (majorFunctionPersonalRatioEnabled && isMajorFn)
                        ? Math.max(targetDeviationWeight, majorTargetDeviationWeight)
                        : targetDeviationWeight;
                    if (fnDeviationWeight > 0) {
                        addObjective(devPos, fnDeviationWeight);
                        addObjective(devNeg, fnDeviationWeight);
                    }
                    addConstraint('f_tdev', (staffFnVars[sid][fn] || []).concat([
                        { name: devNeg, coef: 1 },
                        { name: devPos, coef: -1 }
                    ]), constants.GLP_FX, target, target);
                });
            }
        });

        const objectiveVars = [];
        objective.forEach((coef, name) => {
            objectiveVars.push({ name, coef });
        });
        const lp = {
            name: 'function_assignment_mip_refine',
            objective: {
                direction: constants.GLP_MIN,
                name: 'total_cost',
                vars: objectiveVars
            },
            subjectTo,
            bounds: Array.from(bounds.values()),
            binaries: Array.from(binaries)
        };

        const functionMIPCfg = this.cloneDeep(config || {});
        if (!functionMIPCfg.mip || typeof functionMIPCfg.mip !== 'object') {
            functionMIPCfg.mip = {};
        }
        functionMIPCfg.mip.timeLimitSec = Math.max(6, Math.floor(Number(config?.mip?.functionTimeLimitSec) || 14));
        functionMIPCfg.mip.mipGap = Math.max(0, Number(config?.mip?.functionMipGap) || 0.02);
        functionMIPCfg.mip.maxRetryProfiles = Math.max(1, Math.min(3, Math.floor(Number(config?.mip?.functionMaxRetryProfiles) || 2)));

        const solvePack = await this.solveMIPWithRetries({
            glpk,
            lp,
            constants,
            config: functionMIPCfg,
            baseTimeSec: functionMIPCfg.mip.timeLimitSec,
            phase: 'function'
        });
        if (solvePack.isFeasible !== true) {
            const trace = (solvePack.attemptLogs || []).map((item) => `${item.id}:${item.statusLabel}`).join(',');
            throw new Error(`职能二阶段MIP未得到可行解，status=${solvePack.status}(${this.getStatusLabel(solvePack.status, constants)}),attempts=${trace}`);
        }

        const vars = solvePack.result && solvePack.result.vars ? solvePack.result.vars : {};
        let optimizedAssignments = slots.map((slot, idx) => {
            let pickedFn = slot.originalFunction;
            let bestVal = -Infinity;
            functionTypes.forEach((fn) => {
                const v = Number(vars[zVarMap[idx][fn]]) || 0;
                if (v > bestVal) {
                    bestVal = v;
                    pickedFn = fn;
                }
            });
            return {
                sid: slot.sid,
                date: slot.date,
                shift: slot.shift,
                function: pickedFn
            };
        });

        let majorShiftRepair = { swapCount: 0, majorGapGain: 0 };
        let majorMixRepair = { swapCount: 0, majorL1Gain: 0 };
        if (majorFunctionPersonalRatioEnabled !== false && typeof CSPSolver?.rebalanceMajorRatioByShiftSwaps === 'function') {
            const repairAssignments = optimizedAssignments.map((slot) => ({ ...slot }));
            const repairArtifacts = this.rebuildFunctionArtifacts({
                assignments: repairAssignments,
                dateList,
                staffList,
                functionTypes
            });
            const repairRng = (typeof CSPSolver?.createSeededRandom === 'function')
                ? CSPSolver.createSeededRandom(20260310)
                : { random: () => Math.random() };
            majorShiftRepair = CSPSolver.rebalanceMajorRatioByShiftSwaps({
                allAssignments: repairAssignments,
                staffFunctionCounts: repairArtifacts.staffFunctionCounts,
                staffFunctionTargets,
                staffAssignmentCount: repairArtifacts.staffAssignmentCount,
                functionBalanceM,
                shiftBalanceSixTotalTolerance: Math.max(0, Math.floor(Number(config?.shiftBalanceSixTotalTolerance) || 1)),
                rng: repairRng,
                maxIterations: 1800
            }) || { swapCount: 0, majorGapGain: 0 };
            if (majorShiftRepair.swapCount > 0 && typeof CSPSolver?.rebalanceStaffMajorFunctions === 'function') {
                const monthlyAssigned = {};
                functionTypes.forEach((fn) => {
                    monthlyAssigned[fn] = Object.keys(repairArtifacts.staffFunctionCounts || {}).reduce((sum, sid) => {
                        return sum + (Number(repairArtifacts.staffFunctionCounts?.[sid]?.[fn]) || 0);
                    }, 0);
                });
                CSPSolver.rebalanceStaffMajorFunctions({
                    allAssignments: repairAssignments,
                    staffFunctionCounts: repairArtifacts.staffFunctionCounts,
                    monthlyAssigned,
                    dailyFunctionStats: repairArtifacts.dailyFunctionStats,
                    dailyFunctionTargets: baseDailyTargets,
                    functionTargets: baseFunctionResult?.functionTargets || {},
                    staffFunctionTargets,
                    staffAssignmentCount: repairArtifacts.staffAssignmentCount,
                    rng: repairRng,
                    maxIterations: 700
                });
            }
            if (typeof CSPSolver?.rebalanceMajorFunctionMixByShiftSwaps === 'function') {
                majorMixRepair = CSPSolver.rebalanceMajorFunctionMixByShiftSwaps({
                    allAssignments: repairAssignments,
                    staffFunctionCounts: repairArtifacts.staffFunctionCounts,
                    staffFunctionTargets,
                    staffAssignmentCount: repairArtifacts.staffAssignmentCount,
                    rng: repairRng,
                    maxIterations: 1400
                }) || { swapCount: 0, majorL1Gain: 0 };
            }
            optimizedAssignments = repairAssignments;
        }

        const optimizedArtifacts = this.rebuildFunctionArtifacts({
            assignments: optimizedAssignments,
            dateList,
            staffList,
            functionTypes
        });
        const beforeMetrics = this.computeFunctionImbalanceMetrics({
            staffFunctionCounts: baselineArtifacts.staffFunctionCounts,
            staffAssignmentCount: baselineArtifacts.staffAssignmentCount,
            functionBalanceM,
            majorFunctionPersonalRatioEnabled
        });
        const afterMetrics = this.computeFunctionImbalanceMetrics({
            staffFunctionCounts: optimizedArtifacts.staffFunctionCounts,
            staffAssignmentCount: optimizedArtifacts.staffAssignmentCount,
            functionBalanceM,
            majorFunctionPersonalRatioEnabled
        });
        const changedSlots = optimizedAssignments.reduce((sum, slot, idx) => {
            const oldFn = slots[idx]?.originalFunction || '';
            return sum + (slot.function === oldFn ? 0 : 1);
        }, 0);
        const improved = majorFunctionPersonalRatioEnabled
            ? (
                afterMetrics.majorViolationTotal < beforeMetrics.majorViolationTotal
                || (afterMetrics.majorViolationTotal === beforeMetrics.majorViolationTotal
                    && afterMetrics.balanceViolationTotal < beforeMetrics.balanceViolationTotal)
            )
            : (afterMetrics.balanceViolationTotal <= beforeMetrics.balanceViolationTotal);

        const warnings = this.rebuildFunctionBalanceWarnings(
            baseFunctionResult?.warnings || [],
            optimizedArtifacts.staffFunctionCounts,
            optimizedArtifacts.staffAssignmentCount,
            functionBalanceM,
            majorFunctionPersonalRatioEnabled,
            optimizedAssignments,
            Math.max(0, Math.floor(Number(config?.shiftBalanceSixTotalTolerance) || 1))
        );
        if (changedSlots > 0) {
            if (majorFunctionPersonalRatioEnabled) {
                warnings.push(
                    `职能二阶段MIP重排已执行 ${changedSlots} 个班次（网天微违约 ${beforeMetrics.majorViolationTotal} -> ${afterMetrics.majorViolationTotal}）`
                );
            } else {
                warnings.push(
                    `职能二阶段MIP重排已执行 ${changedSlots} 个班次（六类职能违约 ${beforeMetrics.balanceViolationTotal} -> ${afterMetrics.balanceViolationTotal}）`
                );
            }
        }
        if (majorShiftRepair.swapCount > 0) {
            warnings.push(
                `网天微比例同班别互换修复已执行 ${majorShiftRepair.swapCount} 次（偏差改善 ${Number(majorShiftRepair.majorGapGain || 0)}）`
            );
        }
        if (majorMixRepair.swapCount > 0) {
            warnings.push(
                `网天微同班别细化互换已执行 ${majorMixRepair.swapCount} 次（偏差改善 ${Number(majorMixRepair.majorL1Gain || 0)}）`
            );
        }

        const functionResult = {
            ...(baseFunctionResult || {}),
            dailyFunctionStats: optimizedArtifacts.dailyFunctionStats,
            functionScheduleByStaff: optimizedArtifacts.functionScheduleByStaff,
            staffFunctionCounts: optimizedArtifacts.staffFunctionCounts,
            warnings
        };

        return {
            applied: true,
            functionResult,
            meta: {
                status: solvePack.status,
                objectiveValue: Number.isFinite(Number(solvePack.result?.z)) ? Number(solvePack.result.z) : null,
                changedSlots,
                improved,
                majorFunctionPersonalRatioEnabled,
                beforeMetrics,
                afterMetrics,
                majorShiftRepair,
                majorMixRepair,
                options: solvePack.options || null,
                attemptLogs: solvePack.attemptLogs || []
            }
        };
    },

    async generateDayShiftScheduleMIP(params) {
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
        if (typeof CSPSolver === 'undefined' || !CSPSolver) {
            throw new Error('MIP 依赖 CSPSolver 公共方法，但当前未加载');
        }

        const config = this.buildConfig(rules);
        const dateList = CSPSolver.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);

        const staffList = staffData.map((s) => {
            const sid = CSPSolver.normalizeStaffId(s);
            return {
                ...s,
                _sid: sid,
                _score: CSPSolver.normalizeNumber(s.score, 0),
                _name: s.name || sid
            };
        }).filter((s) => !!s._sid);

        if (staffList.length === 0) {
            return {
                schedule: {},
                functionSchedule: {},
                stats: {
                    totalAssignments: 0,
                    hardViolations: { total: 0, dailyShortage: 0, targetMismatch: 0, targetOverflow: 0, maxWorkViolation: 0, maxRestViolation: 0, shortageByDate: {} },
                    warnings: [],
                    errors: ['无可用人员数据']
                },
                meta: {
                    vacationCleared: [],
                    monthlyShiftAssignments: {},
                    requestStateAfterSolve: {}
                }
            };
        }

        const requestState = CSPSolver.normalizeRequestState(personalRequests, staffList, dateList);
        const nightMap = CSPSolver.normalizeNightSchedule(nightSchedule, staffList, dateList);
        const dailyMinDemand = CSPSolver.getDailyMinimumDemand(dateList);
        const targetDaysBase = CSPSolver.buildTargetDays(staffList, dateList, restDays, requestState, nightMap);
        const targetAdjust = (typeof CSPSolver.applyPlannedExtraTargetDays === 'function')
            ? CSPSolver.applyPlannedExtraTargetDays(targetDaysBase, staffList, config)
            : { targetDays: targetDaysBase, plannedExtraByStaff: {}, plannedExtraTotal: 0 };
        const targetDays = targetAdjust.targetDays || targetDaysBase;
        const relax = (Array.isArray(config.relaxLevels) && config.relaxLevels.length > 0)
            ? (config.relaxLevels[0] || { name: 'L0', minWork: 3, maxWork: 6, minRest: 2, maxRest: 4 })
            : { name: 'L0', minWork: 3, maxWork: 6, minRest: 2, maxRest: 4 };

        const glpk = await this.loadGLPK();
        const constants = this.getGlpkConstants(glpk);
        const rng = CSPSolver.createSeededRandom(20260301);

        let monthlyShiftAssignments = {};
        let monthlyShiftMIPMeta = null;
        try {
            const monthlySolve = await this.solveMonthlyShiftAssignmentsMIP({
                glpk,
                constants,
                staffList,
                dateList,
                requestState,
                nightMap,
                dailyMinDemand,
                targetDays,
                config
            });
            monthlyShiftAssignments = monthlySolve.assignment || {};
            monthlyShiftMIPMeta = {
                status: monthlySolve.status || null,
                objectiveValue: Number.isFinite(Number(monthlySolve.objectiveValue))
                    ? Number(monthlySolve.objectiveValue)
                    : null,
                forcedCount: Number(monthlySolve.forcedCount || 0),
                attemptLogs: Array.isArray(monthlySolve.attemptLogs) ? monthlySolve.attemptLogs.slice() : [],
                options: monthlySolve.options || null
            };
        } catch (monthlyError) {
            console.warn('[MIPDayShiftSolver] 月班别MIP失败，回退启发式分配:', monthlyError);
            monthlyShiftAssignments = CSPSolver.assignMonthlyShifts({
                staffList,
                dateList,
                requestState,
                nightMap,
                dailyMinDemand,
                targetDays,
                rng,
                maxRepairSteps: Math.max(50, Math.floor(Number(config?.mip?.maxRepairSteps) || 220))
            });
            monthlyShiftMIPMeta = {
                status: 'FALLBACK_HEURISTIC',
                objectiveValue: null,
                forcedCount: 0,
                error: monthlyError && monthlyError.message ? monthlyError.message : 'unknown',
                attemptLogs: []
            };
        }

        const extraCapByStaff = this.buildExtraCapByStaff(staffList, targetDays, config);

        const model = this.buildModel({
            constants,
            staffList,
            dateList,
            requestState,
            nightMap,
            dailyMinDemand,
            targetDays,
            monthlyShiftAssignments,
            extraCapByStaff,
            relax,
            config
        });

        const solvePack = await this.solveMIPWithRetries({
            glpk,
            lp: model.lp,
            constants,
            config,
            baseTimeSec: Math.max(5, Math.floor(Number(config?.mip?.timeLimitSec) || 25)),
            phase: 'day'
        });
        const solved = solvePack.solved;
        const result = solvePack.result;
        const status = solvePack.status;
        const isFeasible = solvePack.isFeasible === true;
        if (!isFeasible) {
            const trace = (solvePack.attemptLogs || [])
                .map((item) => `${item.id}:${item.statusLabel}`)
                .join(',');
            throw new Error(`MIP 求解未得到可行解，status=${status}(${this.getStatusLabel(status, constants)}),attempts=${trace}`);
        }

        const vars = result.vars || {};
        const rawScheduleByStaff = this.decodeScheduleFromSolution(
            staffList,
            dateList,
            monthlyShiftAssignments,
            model.yVarMap,
            vars
        );
        const sanitized = this.sanitizeBlockedAssignments(rawScheduleByStaff, requestState, nightMap);
        const scheduleByStaff = sanitized.schedule || {};
        const shortageRepair = (typeof CSPSolver.repairDailyShortageByShiftAddsAndMoves === 'function')
            ? CSPSolver.repairDailyShortageByShiftAddsAndMoves({
                staffIds: staffList.map((s) => s._sid),
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
                maxEmergencyExtraDayPerStaff: Math.max(0, Math.floor(Number(config?.maxEmergencyExtraDayPerStaff) || 0)),
                maxRepairSteps: Math.max(180, Math.floor(Number(config?.mip?.maxRepairSteps) || 220))
            })
            : { addCount: 0, moveCount: 0, shortageReduced: 0 };
        const fairnessRepair = (typeof CSPSolver.repairStaffWorkdayFairnessByShiftTransfers === 'function')
            ? CSPSolver.repairStaffWorkdayFairnessByShiftTransfers({
                staffIds: staffList.map((s) => s._sid),
                dateList,
                scheduleByStaff,
                monthlyShiftAssignments,
                targetDays,
                requestState,
                nightMap,
                dailyMinDemand,
                relax,
                rng,
                maxTransferSteps: Math.max(140, Math.floor(Number(config?.mip?.maxRepairSteps) || 220))
            })
            : { transferCount: 0, fairnessGain: 0 };
        const hardTargetRepair = (typeof CSPSolver.repairHardTargetMismatch === 'function')
            ? CSPSolver.repairHardTargetMismatch({
                staffIds: staffList.map((s) => s._sid),
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
                maxRepairSteps: Math.max(120, Math.floor(Number(config?.mip?.maxRepairSteps) || 220))
            })
            : { transferCount: 0, addCount: 0, dropCount: 0, hardGain: 0, residualTargetMismatch: 0 };
        const underTargetRepair = (typeof CSPSolver.repairUnderTargetByShiftTransfers === 'function')
            ? CSPSolver.repairUnderTargetByShiftTransfers({
                staffIds: staffList.map((s) => s._sid),
                dateList,
                scheduleByStaff,
                monthlyShiftAssignments,
                targetDays,
                requestState,
                nightMap,
                relax,
                rng,
                config,
                maxTransferSteps: Math.max(120, Math.floor(Number(config?.mip?.maxRepairSteps) || 220))
            })
            : { transferCount: 0, underGain: 0, residualUnderTarget: 0 };
        const overflowRepair = (typeof CSPSolver.repairTargetOverflowBySafeDrops === 'function')
            ? CSPSolver.repairTargetOverflowBySafeDrops({
                staffIds: staffList.map((s) => s._sid),
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
                maxDropSteps: Math.max(80, Math.floor(Number(config?.mip?.maxRepairSteps) || 180))
            })
            : { dropCount: 0, overflowGain: 0, residualOverflow: 0 };
        const finalShortageRepair = (typeof CSPSolver.repairDailyShortageByShiftAddsAndMoves === 'function')
            ? CSPSolver.repairDailyShortageByShiftAddsAndMoves({
                staffIds: staffList.map((s) => s._sid),
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
                maxEmergencyExtraDayPerStaff: Math.max(0, Math.floor(Number(config?.maxEmergencyExtraDayPerStaff) || 0)),
                allowBreakMaxWorkOnEmergency: true,
                maxRepairSteps: Math.max(220, Math.floor(Number(config?.mip?.maxRepairSteps) || 260))
            })
            : { addCount: 0, moveCount: 0, shortageReduced: 0 };
        const postFinalOverflowTransferRepair = (typeof CSPSolver.repairOverflowByShiftTransfers === 'function')
            ? CSPSolver.repairOverflowByShiftTransfers({
                staffIds: staffList.map((s) => s._sid),
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
                maxTransferSteps: Math.max(140, Math.floor(Number(config?.mip?.maxRepairSteps) || 260))
            })
            : { transferCount: 0, overflowGain: 0 };
        const postFinalOverflowDropRepair = (typeof CSPSolver.repairTargetOverflowBySafeDrops === 'function')
            ? CSPSolver.repairTargetOverflowBySafeDrops({
                staffIds: staffList.map((s) => s._sid),
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
                maxDropSteps: Math.max(140, Math.floor(Number(config?.mip?.maxRepairSteps) || 260))
            })
            : { dropCount: 0, overflowGain: 0, residualOverflow: 0 };

        const evaluation = CSPSolver.evaluateSchedule({
            scheduleByStaff,
            dateList,
            dailyMinDemand,
            monthlyShiftAssignments,
            targetDays,
            relax,
            nightMap,
            maxExtraDayPerStaff: Math.max(0, Math.floor(Number(config.maxExtraDayPerStaff) || 0)),
            extraCapByStaff,
            preferredMinWorkDays: Math.max(1, Math.floor(Number(config.preferredMinWorkDays) || 4)),
            preferredMinRestDays: Math.max(1, Math.floor(Number(config.preferredMinRestDays) || 4)),
            preferredLongestRestDays: Math.max(
                1,
                Math.floor(Number(config.preferredLongestRestDays) || Number(config.preferredMinRestDays) || 4)
            ),
            continuousRestSoftGoalEnabled: config?.continuousRestSoftGoalEnabled !== false
        });

        const baseFunctionResult = CSPSolver.assignFunctions({
            scheduleByStaff,
            dateList,
            staffList,
            functionBalanceM: config.functionBalanceM,
            shiftBalanceSixTotalTolerance: Math.max(0, Math.floor(Number(config.shiftBalanceSixTotalTolerance) || 1)),
            globalDailyFunctionBaseline: config.globalDailyFunctionBaseline,
            dailyFunctionMinThreshold: config.dailyFunctionMinThreshold,
            dailyFunctionMinima: config.dailyFunctionMinima,
            functionAllocationMode: config.functionAllocationMode,
            functionBaselineScope: config.functionBaselineScope,
            majorFunctionPersonalRatioEnabled: config.majorFunctionPersonalRatioEnabled !== false
        });
        let functionResult = baseFunctionResult;
        let functionAssignmentMIPMeta = null;
        try {
            const refined = await this.optimizeFunctionAssignmentsMIP({
                glpk,
                constants,
                config,
                staffList,
                dateList,
                scheduleByStaff,
                baseFunctionResult
            });
            if (refined && refined.applied === true && refined.functionResult) {
                functionResult = refined.functionResult;
                functionAssignmentMIPMeta = refined.meta || null;
            } else if (refined && refined.reason) {
                functionAssignmentMIPMeta = {
                    skipped: true,
                    reason: String(refined.reason || '')
                };
            }
        } catch (functionMipError) {
            functionAssignmentMIPMeta = {
                failed: true,
                error: functionMipError && functionMipError.message
                    ? functionMipError.message
                    : String(functionMipError || 'unknown')
            };
            functionResult = baseFunctionResult;
        }

        const yearlyDelta = CSPSolver.buildYearlyFunctionDelta(functionResult.staffFunctionCounts);
        await CSPSolver.persistYearlyFunctionDelta(staffList, yearlyDelta);

        const extraDayResult = this.buildExtraDayUsage(scheduleByStaff, targetDays);
        const warnings = (functionResult.warnings || []).slice();
        const errors = [];
        if (Number(sanitized.removedBlockedAssignments || 0) > 0) {
            warnings.push(`已清理阻塞冲突排班 ${Number(sanitized.removedBlockedAssignments || 0)} 条（夜班/休整/个休不可排）`);
        }
        if (Number(shortageRepair.addCount || 0) > 0 || Number(shortageRepair.moveCount || 0) > 0) {
            warnings.push(`已执行缺班定向修复 add=${Number(shortageRepair.addCount || 0)}, move=${Number(shortageRepair.moveCount || 0)}`);
        }
        if (Number(fairnessRepair.transferCount || 0) > 0) {
            warnings.push(`已执行同班别人天均衡修复 ${Number(fairnessRepair.transferCount || 0)} 次`);
        }
        if (Number(hardTargetRepair.hardGain || 0) > 0) {
            warnings.push(`已执行目标硬约束修复 gain=${Number(hardTargetRepair.hardGain || 0)}`);
        }
        if (Number(underTargetRepair.transferCount || 0) > 0) {
            warnings.push(`已执行欠配优先补齐 ${Number(underTargetRepair.transferCount || 0)} 次`);
        }
        if (Number(overflowRepair.dropCount || 0) > 0) {
            warnings.push(`已执行过量回收 ${Number(overflowRepair.dropCount || 0)} 次`);
        }
        if (Number(finalShortageRepair.addCount || 0) > 0 || Number(finalShortageRepair.moveCount || 0) > 0) {
            warnings.push(`已执行末轮缺班强修复 add=${Number(finalShortageRepair.addCount || 0)}, move=${Number(finalShortageRepair.moveCount || 0)}`);
        }
        if (Number(postFinalOverflowTransferRepair.transferCount || 0) > 0 || Number(postFinalOverflowDropRepair.dropCount || 0) > 0) {
            warnings.push(
                `已执行末轮后过量回收 transfer=${Number(postFinalOverflowTransferRepair.transferCount || 0)}, drop=${Number(postFinalOverflowDropRepair.dropCount || 0)}`
            );
        }

        if (evaluation.hardViolations && evaluation.hardViolations.total > 0) {
            warnings.push('MIP 返回了最小违约解（存在硬约束缺口，请检查缺口补偿参数）');
        }
        if (status !== constants.GLP_OPT) {
            warnings.push(`MIP 在时限内返回可行解（status=${status}），未证明全局最优`);
        }
        if (functionAssignmentMIPMeta && functionAssignmentMIPMeta.failed === true) {
            warnings.push(`职能二阶段MIP失败，已回退基线职能分配：${functionAssignmentMIPMeta.error || 'unknown'}`);
        }

        const stats = {
            totalAssignments: evaluation.totalAssignments,
            shiftDistribution: CSPSolver.countShiftDistribution(monthlyShiftAssignments),
            monthlyShiftAssignments,
            targetDaysByStaff: targetDays,
            extraDayUsage: extraDayResult.usage,
            extraDayTotal: extraDayResult.total,
            shortageRepair,
            fairnessRepair,
            hardTargetRepair,
            underTargetRepair,
            overflowRepair,
            finalShortageRepair,
            postFinalOverflowTransferRepair,
            postFinalOverflowDropRepair,
            plannedExtraTargetByStaff: targetAdjust.plannedExtraByStaff || {},
            plannedExtraTargetTotal: targetAdjust.plannedExtraTotal || 0,
            relaxationLevel: `MIP-${relax.name || 'L0'}`,
            attempts: 1,
            vacationCleared: [],
            hardViolations: evaluation.hardViolations,
            softPenalty: evaluation.softPenalty,
            warnings,
            errors,
            dailyFunctionStats: functionResult.dailyFunctionStats,
            yearlyFunctionDelta: yearlyDelta,
            functionTargets: functionResult.functionTargets,
            shanghaiFunctionThirdTarget: functionResult.shanghaiFunctionThirdTarget,
            shanghaiFunctionActualTotal: functionResult.actualTotalAssignments,
            mip: {
                status,
                objectiveValue: Number.isFinite(Number(result.z)) ? Number(result.z) : null,
                solveTimeSec: Number.isFinite(Number(solved?.time)) ? Number(solved.time) : null,
                rowCount: Array.isArray(model.lp.subjectTo) ? model.lp.subjectTo.length : 0,
                binaryCount: Array.isArray(model.lp.binaries) ? model.lp.binaries.length : 0,
                monthlyShiftAssignment: monthlyShiftMIPMeta,
                functionAssignment: functionAssignmentMIPMeta,
                attemptLogs: solvePack.attemptLogs || [],
                options: solvePack.options || null
            }
        };

        return {
            schedule: scheduleByStaff,
            functionSchedule: functionResult.functionScheduleByStaff,
            stats,
            dailyFunctionStats: functionResult.dailyFunctionStats,
            yearlyFunctionDelta: yearlyDelta,
            meta: {
                vacationCleared: [],
                monthlyShiftAssignments,
                requestStateAfterSolve: CSPSolver.cloneDeep(requestState),
                mip: {
                    status,
                    objectiveValue: Number.isFinite(Number(result.z)) ? Number(result.z) : null,
                    solveTimeSec: Number.isFinite(Number(solved?.time)) ? Number(solved.time) : null,
                    monthlyShiftAssignment: monthlyShiftMIPMeta,
                    functionAssignment: functionAssignmentMIPMeta,
                    removedBlockedAssignments: Number(sanitized.removedBlockedAssignments || 0),
                    options: solvePack.options || null,
                    attemptLogs: solvePack.attemptLogs || []
                }
            }
        };
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
    window.MIPDayShiftSolver = MIPDayShiftSolver;
}
