/**
 * Python 代码的 1:1 JavaScript 复刻修复版
 * 修复：CSV解析错位导致生理期/请假约束失效的问题
 */

// ================= 1. 基础配置 =================
const CONFIG = {
    startDateStr: '2026-01-26', 
    endDateStr: '2026-02-25',   
    minDaily: 2,
    maxDaily: 2,    
    maxStepsPerPhase: 100000,
};

const BASE_DURATION = { '男': 4, '女': 3 };

// ================= 2. 数据源 =================
const CSV_STAFF = `人员ID,姓名,性别,人员类型,归属地,技能,大夜是否可排,生理期,上个月大夜天数,上年春节上班天数,上年国庆上班天数,当年节假上班天数
1001,上海员工_01,女,全人力侦测,上海,"网,天,微,银B,追,毛",否,,0,2,1,3
1002,上海员工_02,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,0,3,1
1003,上海员工_03,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,下,3,1,1,2
1004,上海员工_04,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,3,2,5
1005,上海员工_05,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,上,3,0,0,0
1006,上海员工_06,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,2,2,4
1007,上海员工_07,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,下,3,1,0,1
1008,上海员工_08,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,0,1,2
1009,上海员工_09,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,上,3,2,3,4
1010,上海员工_10,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,1,1,1
1011,上海员工_11,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,下,3,0,0,0
1012,上海员工_12,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,3,2,3
1013,上海员工_13,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,上,3,1,1,2
1014,上海员工_14,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,2,2,4
1015,上海员工_15,女,全人力侦测,上海,"网,天,微,银B,追,毛",否,,0,0,1,1
1016,上海员工_16,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,1,0,2
1017,上海员工_17,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,上,3,2,3,5
1018,上海员工_18,男,全人力侦测,上海,"网,天,微,银B,追,毛",是,,4,0,2,1
1019,上海员工_19,女,全人力侦测,上海,"网,天,微,银B,追,毛",是,下,3,1,1,3`;

const CSV_LEAVE = `ID\t姓名\t2026-01-26\t2026-01-27\t2026-01-28\t2026-01-29\t2026-01-30\t2026-01-31\t2026-02-01\t2026-02-02\t2026-02-03\t2026-02-04\t2026-02-05\t2026-02-06\t2026-02-07\t2026-02-08\t2026-02-09\t2026-02-10\t2026-02-11\t2026-02-12\t2026-02-13\t2026-02-14\t2026-02-15\t2026-02-16\t2026-02-17\t2026-02-18\t2026-02-19\t2026-02-20\t2026-02-21\t2026-02-22\t2026-02-23\t2026-02-24\t2026-02-25
1001\t上海员工_01\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1002\t上海员工_02\t\t\t年假\t\t\t\t\t\t\t\t\t\t法定休\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1003\t上海员工_03\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1004\t上海员工_04\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1005\t上海员工_05\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1006\t上海员工_06\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1007\t上海员工_07\t\t\t\t\t\t\t\t法定休\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1008\t上海员工_08\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1009\t上海员工_09\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1010\t上海员工_10\t\t\t年假\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1011\t上海员工_11\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t法定休\t\t\t\t\t\t\t\t\t
1012\t上海员工_12\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1013\t上海员工_13\t\t\t\t\t年假\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1014\t上海员工_14\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t年假\t\t\t\t\t\t\t\t\t
1015\t上海员工_15\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1016\t上海员工_16\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1017\t上海员工_17\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1018\t上海员工_18\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
1019\t上海员工_19\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`;

// ================= 3. 调度器逻辑 =================
class IncrementalScheduler {
    constructor() {
        this.staffPool = [];
        this.startDate = new Date(CONFIG.startDateStr);
        this.endDate = new Date(CONFIG.endDateStr);
        this.totalDays = Math.round((this.endDate - this.startDate) / (1000 * 60 * 60 * 24)) + 1;

        this.schedule = [];
        this.assignedIds = new Set();
        this.steps = 0;
        this.allBlocks = [];

        this.initStaff();
    }

    getDateIndex(dateStr) {
        const dt = new Date(dateStr);
        const diffTime = dt - this.startDate;
        return Math.round(diffTime / (1000 * 60 * 60 * 24));
    }

    initStaff() {
        // --- 1. 请假处理 ---
        const leaveMap = new Map();
        const leaveRows = CSV_LEAVE.trim().split('\n');
        const header = leaveRows[0].split('\t');
        
        const dateCols = [];
        header.forEach((h, idx) => {
            if (h.startsWith('2026')) dateCols.push({ idx, str: h });
        });

        for (let i = 1; i < leaveRows.length; i++) {
            const cols = leaveRows[i].split('\t');
            const id = cols[0];
            const leaves = new Set();
            dateCols.forEach(dc => {
                const val = cols[dc.idx] ? cols[dc.idx].trim() : '';
                if (val) {
                    const dayIdx = this.getDateIndex(dc.str);
                    if (dayIdx >= 0 && dayIdx < this.totalDays) leaves.add(dayIdx);
                }
            });
            leaveMap.set(id, leaves);
        }

        // --- 2. 人员处理 (修复CSV解析) ---
        const staffRows = CSV_STAFF.trim().split('\n');
        const half = Math.floor(this.totalDays / 2);

        for (let i = 1; i < staffRows.length; i++) {
            // 【核心修复】：使用正则 split，忽略引号内的逗号
            const cols = staffRows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            
            const id = cols[0];
            const name = cols[1];
            const gender = cols[2];
            // 注意：因为正则split后，列索引是准确的
            const canNight = cols[6].trim(); 
            const period = cols[7] ? cols[7].trim() : ""; 
            const lastMonth = parseInt(cols[8] || 0);

            if (canNight === '否') continue;

            // 调试日志：打印识别出的生理期，确保解析正确
            if (period) {
                console.log(`[调试] 员工: ${name}, 生理期识别为: "${period}" (将在排班中避开)`);
            }

            const unavail = new Set();
            let isUrgentEarly = false;

            // 生理期屏蔽逻辑
            if (period === '下') {
                for (let d = half; d < this.totalDays; d++) unavail.add(d);
                isUrgentEarly = true; 
            }
            if (period === '上') {
                for (let d = 0; d < half; d++) unavail.add(d);
            }

            if (leaveMap.has(id)) {
                leaveMap.get(id).forEach(d => unavail.add(d));
            }

            const score = 100 - (lastMonth * 10);
            const baseDur = BASE_DURATION[gender];

            this.staffPool.push({
                id, name, score, baseDur, unavail, isUrgentEarly
            });
        }
        this.staffPool.sort((a, b) => b.score - a.score);
    }

    generateBlocksForStrategy(p1Ratio, p2Ratio) {
        const count = this.staffPool.length;
        const limitP1 = Math.floor(count * p1Ratio);
        const limitP2 = Math.floor(count * p2Ratio);

        const allowedP1 = new Set(this.staffPool.slice(0, limitP1).map(s => s.id));
        const allowedP2 = new Set(this.staffPool.slice(0, limitP2).map(s => s.id));

        const blocks = [];
        for (const staff of this.staffPool) {
            const durs = [staff.baseDur];
            if (allowedP1.has(staff.id)) durs.push(staff.baseDur + 1);
            if (allowedP2.has(staff.id)) durs.push(staff.baseDur + 2);

            const uniqueDurs = [...new Set(durs)];
            for (const len of uniqueDurs) {
                for (let start = 0; start <= this.totalDays - len; start++) {
                    const days = [];
                    let valid = true;
                    for (let k = 0; k < len; k++) {
                        const d = start + k;
                        if (staff.unavail.has(d)) { valid = false; break; }
                        days.push(d);
                    }
                    if (valid) {
                        blocks.push({
                            staffId: staff.id, name: staff.name, days, 
                            score: staff.score, length: len, isUrgentEarly: staff.isUrgentEarly
                        });
                    }
                }
            }
        }
        return blocks;
    }

    backtrack(dayIndex) {
        this.steps++;
        if (this.steps > CONFIG.maxStepsPerPhase) return false;
        if (dayIndex >= this.totalDays) return true;

        if (this.schedule[dayIndex].length >= CONFIG.minDaily) {
            if (this.backtrack(dayIndex + 1)) return true;
        }

        if (this.schedule[dayIndex].length >= CONFIG.maxDaily) return false;

        const candidates = this.allBlocks.filter(b => 
            b.days.includes(dayIndex) && !this.assignedIds.has(b.staffId)
        );

        candidates.sort((a, b) => {
            // 策略：如果是上半月，且某人必须尽早排（因为下半月有生理期），则大大提高优先级
            if (dayIndex < 15) {
                const aU = a.isUrgentEarly ? 0 : 1;
                const bU = b.isUrgentEarly ? 0 : 1;
                if (aU !== bU) return aU - bU;
            }
            if (a.length !== b.length) return a.length - b.length;
            if (a.score !== b.score) return b.score - a.score;
            return Math.random() - 0.5;
        });

        for (const block of candidates) {
            let conflict = false;
            for (const d of block.days) {
                if (this.schedule[d].length >= CONFIG.maxDaily) { conflict = true; break; }
            }
            if (conflict) continue;

            block.days.forEach(d => this.schedule[d].push(block.name));
            this.assignedIds.add(block.staffId);

            if (this.backtrack(dayIndex)) return true;

            this.assignedIds.delete(block.staffId);
            block.days.forEach(d => this.schedule[d].pop());
        }
        return false;
    }

    solveIncremental() {
        const strategies = [
            [0.0, 0.0], [0.3, 0.0], [0.6, 0.0], [1.0, 0.0],
            [1.0, 0.3], [1.0, 0.6], [1.0, 1.0]
        ];

        console.log(`目标时段: ${CONFIG.startDateStr} 至 ${CONFIG.endDateStr} (${this.totalDays}天)`);
        console.time("执行耗时");

        for (let idx = 0; idx < strategies.length; idx++) {
            const [r1, r2] = strategies[idx];
            this.allBlocks = this.generateBlocksForStrategy(r1, r2);
            this.schedule = Array.from({length: this.totalDays}, () => []);
            this.assignedIds = new Set();
            this.steps = 0;

            if (this.backtrack(0)) {
                console.log(`\n[成功] 策略 Phase ${idx + 1} 成功排产！`);
                console.timeEnd("执行耗时");
                this.printResult();
                return true;
            }
        }
        console.log("无法在当前约束下找到解。");
        return false;
    }

    printResult() {
        const table = this.schedule.map((names, i) => {
            const d = new Date(this.startDate);
            d.setDate(d.getDate() + i);
            return {
                "日期": d.toISOString().slice(0, 10),
                "人数": names.length,
                "名单": names.join(', ')
            };
        });
        console.table(table);
    }
}

new IncrementalScheduler().solveIncremental();