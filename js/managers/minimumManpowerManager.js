/**
 * 每日最低人力配置管理器
 * - 支持平日/特殊节假日两套模板
 * - 支持按天按班别自由调整（+/- 和输入）
 * - 支持总计汇总
 */

const MinimumManpowerManager = {
    SHIFT_KEYS: ['A1', 'A', 'A2', 'B1', 'B2'],
    SHIFT_KEYS_WITH_NIGHT: ['A1', 'A', 'A2', 'B1', 'B2', 'NIGHT'],
    NIGHT_SHIFT_KEY: 'NIGHT',
    TWO_CITY_DEFAULT_VERSION: '20260303_image_default_v1',
    EDITING_INPUT_ID: 'minimumManpowerEditingInput',
    SHIFT_LABELS: {
        A1: 'A1',
        A: 'A',
        A2: 'A2',
        B1: 'B1',
        B2: 'B2',
        NIGHT: '夜'
    },
    TWO_CITY_ROW_DEFS: [
        { key: 'CHASE', label: '追', functionWeights: { '追': 1 } },
        { key: 'STAR_ZONG', label: '4星+1综', functionWeights: { '星': 0.8, '综': 0.2 } },
        { key: 'RECV', label: '收', functionWeights: { '收': 1 } },
        { key: 'SILVER_B', label: '银B', functionWeights: { '银B': 1 } },
        { key: 'TIAN', label: '天', functionWeights: { '天': 1 } },
        { key: 'MAO', label: '毛', functionWeights: { '毛': 1 } },
        { key: 'WEI', label: '微', functionWeights: { '微': 1 } },
        { key: 'NET', label: '网', functionWeights: { '网': 1 } }
    ],
    DEFAULT_TWO_CITY_TEMPLATE: {
        CHASE: { A1: '0', A: '1', A2: '0', B1: '0', B2: '1', NIGHT: '4' },
        STAR_ZONG: { A1: '1', A: '1', A2: '1', B1: '1', B2: '1', NIGHT: '' },
        RECV: { A1: '0', A: '0/1', A2: '0', B1: '0', B2: '1/0', NIGHT: '' },
        SILVER_B: { A1: '1', A: '0', A2: '0', B1: '1', B2: '1', NIGHT: '' },
        TIAN: { A1: '0', A: '1', A2: '1', B1: '0', B2: '0/1', NIGHT: '' },
        MAO: { A1: '1', A: '0', A2: '0', B1: '0', B2: '1', NIGHT: '' },
        WEI: { A1: '0', A: '1', A2: '1', B1: '2', B2: '2', NIGHT: '' },
        NET: { A1: '2', A: '2', A2: '2', B1: '2', B2: '2', NIGHT: '' }
    },
    DEFAULT_CITY_RATIO: {
        SH: { A1: 2, A: 2, A2: 1, B1: 2, B2: 3 },
        CD: { A1: 3, A: 5, A2: 4, B1: 4, B2: 6 }
    },
    DEFAULT_CITY_SHIFT_SPLIT: {
        SH: { A1: 2, A: 2, A2: 1, B1: 2, B2: 3, NIGHT: 2 },
        CD: { A1: 3, A: 5, A2: 4, B1: 4, B2: 6, NIGHT: 2 }
    },
    SCENARIO_COLUMNS: ['springPre3', 'nationalPre3', 'springLate', 'nationalLate', 'dailyBaseline', 'stretch'],
    SCENARIO_COLUMN_LABELS: {
        springPre3: '春节前3天',
        nationalPre3: '国庆前3天',
        springLate: '春节后半段',
        nationalLate: '国庆后半段',
        dailyBaseline: '日常排班底线',
        stretch: '超越人力'
    },
    DEFAULT_SCENARIO_SKILL_DEMAND: {
        'A1银': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B1银': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B2银': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'A追': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B2追': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'A1微': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
        'A微': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'A2微': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B1微': { springPre3: 1, nationalPre3: 1, springLate: 2, nationalLate: 2, dailyBaseline: 2, stretch: 2 },
        'B2微': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 2 },
        'A1网': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 2 },
        'A网': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 2, stretch: 2 },
        'A2网': { springPre3: 1, nationalPre3: 2, springLate: 2, nationalLate: 2, dailyBaseline: 2, stretch: 3 },
        'B1网': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 2, stretch: 2 },
        'B2网': { springPre3: 2, nationalPre3: 2, springLate: 2, nationalLate: 2, dailyBaseline: 2, stretch: 2 },
        'A1天': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
        'A天': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'A2天': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B1天': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
        'B2天': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'A收/综': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B2收/综': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'A1星': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'A星': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 1, stretch: 2 },
        'A2星': { springPre3: 0, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B1星': { springPre3: 0, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B2星': { springPre3: 0, nationalPre3: 0, springLate: 0, nationalLate: 0, dailyBaseline: 0, stretch: 0 },
        'A1毛': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        'B2毛': { springPre3: 1, nationalPre3: 1, springLate: 1, nationalLate: 1, dailyBaseline: 1, stretch: 1 },
        '夜': { springPre3: 4, nationalPre3: 4, springLate: 4, nationalLate: 4, dailyBaseline: 4, stretch: 4 }
    },
    FUNCTION_KEYS: ['网', '天', '微', '追', '收', '综', '银B', '毛', '星'],
    // 合班复用优先级（按顺序应用）
    MERGE_RULES: [
        { id: 'A1_A', primary: 'A1', secondary: 'A', reduceShift: 'A', label: 'A1与A合班复用' },
        { id: 'A_A2', primary: 'A', secondary: 'A2', reduceShift: 'A2', label: 'A与A2合班复用' },
        { id: 'B1_B2', primary: 'B1', secondary: 'B2', reduceShift: 'B2', label: 'B1与B2合班复用' }
    ],
    // 人力富余时的职能增补目标（max+1）
    SURPLUS_BOOST_TARGETS: [
        { key: 'B2_SH_微', label: 'B2-微' },
        { key: 'A1_SH_网', label: 'A1-网' },
        { key: 'A2_SH_网', label: 'A2-网' },
        { key: 'A_SH_星', label: 'A-星' }
    ],
    PERSONAL_VACATION_TYPES: ['ANNUAL', 'LEGAL', 'REQ', 'SICK'],
    editingCell: null,
    editingTempValue: 0,
    activeRenderCityScope: 'ALL',

    getActiveCityScope() {
        if (typeof CityUtils !== 'undefined' && CityUtils.getActiveCityScope) {
            return CityUtils.getActiveCityScope();
        }
        if (typeof Store !== 'undefined' && Store && typeof Store.getState === 'function') {
            const raw = Store.getState('activeCityScope');
            const normalized = typeof CityUtils !== 'undefined' && CityUtils.normalizeCityScope
                ? CityUtils.normalizeCityScope(raw, 'ALL')
                : String(raw || 'ALL').toUpperCase();
            if (normalized === 'SH' || normalized === 'CD' || normalized === 'ALL') return normalized;
        }
        return 'ALL';
    },

    normalizeCityScope(scope, fallback = 'ALL') {
        if (typeof CityUtils !== 'undefined' && CityUtils.normalizeCityScope) {
            return CityUtils.normalizeCityScope(scope, fallback);
        }
        const normalized = String(scope || '').trim().toUpperCase();
        if (normalized === 'SH' || normalized === 'CD' || normalized === 'ALL') {
            return normalized;
        }
        return fallback;
    },

    getCityScopeDisplayName(scope) {
        const normalized = this.normalizeCityScope(scope, 'ALL');
        if (normalized === 'SH') return '上海';
        if (normalized === 'CD') return '成都';
        return '上海+成都';
    },

    checkMutationPermission(options = {}) {
        const silent = !!options.silent;
        const cityScope = options.cityScope || this.getActiveCityScope();
        if (typeof AccessGuard === 'undefined'
            || !AccessGuard
            || typeof AccessGuard.checkActionPermission !== 'function') {
            return { allowed: true };
        }
        const result = AccessGuard.checkActionPermission('minimumManpower', 'edit', { cityScope });
        if (!result || result.allowed !== true) {
            const message = result && result.message ? result.message : '当前工号无权修改最低人力配置';
            if (!silent) {
                if (typeof AccessGuard.showMessage === 'function') {
                    AccessGuard.showMessage(message);
                } else if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                    DialogUtils.alert(message);
                } else {
                    alert(message);
                }
            }
            return { allowed: false, message };
        }
        return { allowed: true };
    },

    escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    getLockDescriptor(lockKey, activeLockKey = null) {
        const parsed = (typeof Store !== 'undefined' && Store && typeof Store.parseLockKey === 'function')
            ? Store.parseLockKey(lockKey)
            : { schedulePeriodConfigId: null, cityScope: 'ALL' };
        const periodCfg = (parsed && parsed.schedulePeriodConfigId && typeof Store.getSchedulePeriodConfig === 'function')
            ? Store.getSchedulePeriodConfig(parsed.schedulePeriodConfigId)
            : null;
        const month = (periodCfg && periodCfg.scheduleConfig)
            ? `${periodCfg.scheduleConfig.year}${String(periodCfg.scheduleConfig.month).padStart(2, '0')}`
            : '未绑定';
        return {
            lockKey,
            month,
            cityName: this.getCityScopeDisplayName(parsed && parsed.cityScope ? parsed.cityScope : 'ALL'),
            isActive: !!activeLockKey && lockKey === activeLockKey
        };
    },

    getArchiveEntries(activeLockKey = null) {
        const profiles = (typeof Store !== 'undefined' && Store && typeof Store.getState === 'function')
            ? (Store.getState('minimumManpowerProfiles') || {})
            : {};
        return Object.keys(profiles).map((lockKey) => {
            const descriptor = this.getLockDescriptor(lockKey, activeLockKey);
            const profile = profiles[lockKey] || {};
            return {
                ...descriptor,
                updatedAt: profile.updatedAt || null
            };
        }).sort((a, b) => {
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;
            const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
            const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
            return tb - ta;
        });
    },

    downloadArchiveSnapshot(encodedLockKey) {
        const lockKey = decodeURIComponent(String(encodedLockKey || ''));
        if (!lockKey || typeof Store.getMinimumManpowerConfigForLock !== 'function') return;
        const profile = Store.getMinimumManpowerConfigForLock(lockKey);
        if (!profile) {
            alert('归档快照不存在');
            return;
        }
        const payload = JSON.stringify(profile, null, 2);
        const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        anchor.href = url;
        anchor.download = `minimum-manpower-archive-${stamp}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    },

    viewArchiveSnapshot(encodedLockKey) {
        const lockKey = decodeURIComponent(String(encodedLockKey || ''));
        if (!lockKey || typeof Store.getMinimumManpowerConfigForLock !== 'function') {
            alert('归档快照不存在');
            return;
        }
        const profile = Store.getMinimumManpowerConfigForLock(lockKey);
        if (!profile) {
            alert('归档快照不存在');
            return;
        }
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const activeLock = (typeof Store.getActiveLockContext === 'function') ? Store.getActiveLockContext() : null;
        const desc = this.getLockDescriptor(lockKey, activeLock && activeLock.lockKey ? activeLock.lockKey : null);
        const weekdayTemplate = profile.weekdayTemplate || {};
        const specialTemplate = profile.specialTemplate || {};
        const dailyDemand = (profile.dailyDemand && typeof profile.dailyDemand === 'object') ? profile.dailyDemand : {};
        const dateRows = Object.keys(dailyDemand).sort().slice(0, 62).map((dateStr) => {
            const row = dailyDemand[dateStr] || {};
            const total = this.SHIFT_KEYS.reduce((sum, shift) => sum + this.normalizePositiveInt(row[shift], 0), 0);
            const cells = this.SHIFT_KEYS.map((shift) => `<td class="px-2 py-1 text-xs border border-gray-200 text-center">${this.normalizePositiveInt(row[shift], 0)}</td>`).join('');
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-2 py-1 text-xs border border-gray-200">${this.escapeHtml(dateStr)}</td>
                    ${cells}
                    <td class="px-2 py-1 text-xs border border-gray-200 font-semibold text-center">${total}</td>
                </tr>
            `;
        }).join('');
        const weekdayText = this.SHIFT_KEYS.map((shift) => `${shift}:${this.normalizePositiveInt(weekdayTemplate[shift], 0)}`).join(' ｜ ');
        const specialText = this.SHIFT_KEYS.map((shift) => `${shift}:${this.normalizePositiveInt(specialTemplate[shift], 0)}`).join(' ｜ ');

        scheduleTable.innerHTML = `
            <div class="p-6 space-y-4">
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h2 class="text-xl font-bold text-gray-800 mb-1">最低人力归档快照</h2>
                    <p class="text-sm text-amber-800">归档只读：仅支持查看和导出，不可直接编辑。</p>
                    <p class="text-xs text-gray-600 mt-2">锁：${this.escapeHtml(desc.month)} ｜ ${this.escapeHtml(desc.cityName)} ｜ ${this.escapeHtml(lockKey)}</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="MinimumManpowerManager.showMinimumManpowerConfig()" class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium">返回最低人力配置</button>
                    <button onclick="MinimumManpowerManager.downloadArchiveSnapshot('${encodeURIComponent(lockKey)}')" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">导出JSON</button>
                </div>
                <div class="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 space-y-1">
                    <p><span class="font-semibold">平日模板：</span>${this.escapeHtml(weekdayText)}</p>
                    <p><span class="font-semibold">特殊日模板：</span>${this.escapeHtml(specialText)}</p>
                </div>
                <div class="bg-white border border-gray-200 rounded-lg p-3">
                    <h3 class="text-sm font-semibold text-gray-700 mb-2">按日需求（最多展示前62天）</h3>
                    <div class="overflow-x-auto overflow-y-auto" style="max-height: 58vh;">
                        <table class="min-w-full border-collapse">
                            <thead class="sticky top-0 bg-gray-50 z-10">
                                <tr>
                                    <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 border border-gray-200">日期</th>
                                    ${this.SHIFT_KEYS.map((shift) => `<th class="px-2 py-1 text-center text-xs font-medium text-gray-500 border border-gray-200">${shift}</th>`).join('')}
                                    <th class="px-2 py-1 text-center text-xs font-medium text-gray-500 border border-gray-200">总计</th>
                                </tr>
                            </thead>
                            <tbody>${dateRows || '<tr><td colspan="7" class="px-3 py-4 text-xs text-gray-500 text-center border border-gray-200">无日需求数据</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    buildShiftScopeFactors(scope, cityRatio) {
        const normalizedScope = typeof CityUtils !== 'undefined' && CityUtils.normalizeCityScope
            ? CityUtils.normalizeCityScope(scope, 'ALL')
            : String(scope || 'ALL').toUpperCase();
        const ratio = this.normalizeCityRatio(cityRatio);
        const factors = {};
        this.SHIFT_KEYS.forEach((shift) => {
            if (normalizedScope === 'ALL') {
                factors[shift] = 1;
                return;
            }
            const sh = this.normalizePositiveInt(ratio.SH?.[shift], 0);
            const cd = this.normalizePositiveInt(ratio.CD?.[shift], 0);
            const total = sh + cd;
            if (total <= 0) {
                factors[shift] = 0;
                return;
            }
            factors[shift] = normalizedScope === 'CD' ? (cd / total) : (sh / total);
        });
        return factors;
    },

    projectScopedShiftValue(rawTotal, shift, scope, cityRatio) {
        const totalValue = this.normalizePositiveInt(rawTotal, 0);
        const factors = this.buildShiftScopeFactors(scope, cityRatio);
        const factor = Number(factors[shift]);
        if (!Number.isFinite(factor) || factor <= 0) return 0;
        if (factor >= 1) return totalValue;
        return Math.max(0, Math.round(totalValue * factor));
    },

    mergeScopedShiftValue(scopedValue, currentTotal, shift, scope, cityRatio) {
        const normalizedScope = typeof CityUtils !== 'undefined' && CityUtils.normalizeCityScope
            ? CityUtils.normalizeCityScope(scope, 'ALL')
            : String(scope || 'ALL').toUpperCase();
        const targetScoped = this.normalizePositiveInt(scopedValue, 0);
        if (normalizedScope === 'ALL') return targetScoped;

        const factors = this.buildShiftScopeFactors(normalizedScope, cityRatio);
        const factor = Number(factors[shift]);
        if (!Number.isFinite(factor) || factor <= 0) {
            return this.normalizePositiveInt(currentTotal, 0);
        }
        if (factor >= 1) return targetScoped;
        return Math.max(0, Math.round(targetScoped / factor));
    },

    getDefaultTemplates() {
        return {
            weekdayTemplate: {
                A1: 2,
                A: 2,
                A2: 1,
                B1: 2,
                B2: 3
            },
            specialTemplate: {
                A1: 1,
                A: 1,
                A2: 1,
                B1: 2,
                B2: 2
            }
        };
    },

    getDefaultTwoCityTemplate() {
        return this.cloneConfig(this.DEFAULT_TWO_CITY_TEMPLATE);
    },

    getDefaultCityRatio() {
        return this.cloneConfig(this.DEFAULT_CITY_RATIO);
    },

    getDefaultCityShiftSplit() {
        return this.cloneConfig(this.DEFAULT_CITY_SHIFT_SPLIT);
    },

    getDefaultScenarioSkillDemand() {
        return this.cloneConfig(this.DEFAULT_SCENARIO_SKILL_DEMAND);
    },

    normalizeTemplateCellString(raw, fallback = '0') {
        const str = String(raw == null ? '' : raw).trim();
        if (str === '') return '';
        const pureInt = str.match(/^\d+$/);
        if (pureInt) {
            return String(Math.max(0, Math.floor(Number(str))));
        }
        const shared = str.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (shared) {
            const a = Math.max(0, Math.floor(Number(shared[1])));
            const b = Math.max(0, Math.floor(Number(shared[2])));
            return `${a}/${b}`;
        }
        const n = Number(str);
        if (Number.isFinite(n)) {
            return String(Math.max(0, Math.floor(n)));
        }
        const fallbackStr = String(fallback == null ? '0' : fallback).trim();
        if (!fallbackStr) return '0';
        return fallbackStr;
    },

    parseTemplateCell(raw) {
        const text = this.normalizeTemplateCellString(raw, '0');
        if (!text) {
            return { text: '', min: 0, max: 0, avg: 0, a: 0, b: 0, isShared: false };
        }
        const shared = text.match(/^(\d+)\/(\d+)$/);
        if (shared) {
            const a = this.normalizePositiveInt(shared[1], 0);
            const b = this.normalizePositiveInt(shared[2], 0);
            return {
                text,
                min: Math.min(a, b),
                max: Math.max(a, b),
                avg: (a + b) / 2,
                a,
                b,
                isShared: true
            };
        }
        const n = this.normalizePositiveInt(text, 0);
        return {
            text: String(n),
            min: n,
            max: n,
            avg: n,
            a: n,
            b: n,
            isShared: false
        };
    },

    normalizeTwoCityTemplate(rawTemplate) {
        const fallback = this.getDefaultTwoCityTemplate();
        const src = rawTemplate && typeof rawTemplate === 'object' ? rawTemplate : {};
        const out = {};

        this.TWO_CITY_ROW_DEFS.forEach((row) => {
            const rowRaw = src[row.key] && typeof src[row.key] === 'object' ? src[row.key] : {};
            const fallbackRow = fallback[row.key] || {};
            out[row.key] = {};
            this.SHIFT_KEYS_WITH_NIGHT.forEach((shift) => {
                out[row.key][shift] = this.normalizeTemplateCellString(rowRaw[shift], fallbackRow[shift] || '0');
            });
        });

        return out;
    },

    normalizeCityRatio(rawRatio) {
        const fallback = this.getDefaultCityRatio();
        const src = rawRatio && typeof rawRatio === 'object' ? rawRatio : {};
        const out = { SH: {}, CD: {} };

        ['SH', 'CD'].forEach((city) => {
            const cityRaw = src[city] && typeof src[city] === 'object' ? src[city] : {};
            this.SHIFT_KEYS.forEach((shift) => {
                out[city][shift] = this.normalizePositiveInt(
                    cityRaw[shift],
                    this.normalizePositiveInt(fallback[city][shift], 0)
                );
            });
        });

        return out;
    },

    normalizeCityShiftSplit(rawSplit) {
        const fallback = this.getDefaultCityShiftSplit();
        const src = rawSplit && typeof rawSplit === 'object' ? rawSplit : {};
        const out = { SH: {}, CD: {} };
        ['SH', 'CD'].forEach((city) => {
            const cityRaw = src[city] && typeof src[city] === 'object' ? src[city] : {};
            this.SHIFT_KEYS_WITH_NIGHT.forEach((shift) => {
                out[city][shift] = this.normalizePositiveInt(
                    cityRaw[shift],
                    this.normalizePositiveInt(fallback[city][shift], 0)
                );
            });
        });
        return out;
    },

    normalizeScenarioSkillDemand(rawDemand) {
        const fallback = this.getDefaultScenarioSkillDemand();
        const src = rawDemand && typeof rawDemand === 'object' ? rawDemand : {};
        const out = {};
        Object.keys(fallback).forEach((skillKey) => {
            out[skillKey] = {};
            const sourceRow = src[skillKey] && typeof src[skillKey] === 'object' ? src[skillKey] : {};
            this.SCENARIO_COLUMNS.forEach((col) => {
                out[skillKey][col] = this.normalizePositiveInt(
                    sourceRow[col],
                    this.normalizePositiveInt(fallback[skillKey][col], 0)
                );
            });
        });
        return out;
    },

    computeScenarioTotals(scenarioSkillDemand) {
        const normalized = this.normalizeScenarioSkillDemand(scenarioSkillDemand);
        const totals = {};
        this.SCENARIO_COLUMNS.forEach((col) => {
            totals[col] = 0;
        });
        Object.keys(normalized).forEach((skillKey) => {
            this.SCENARIO_COLUMNS.forEach((col) => {
                totals[col] += this.normalizePositiveInt(normalized[skillKey]?.[col], 0);
            });
        });
        return totals;
    },

    computeTwoCityShiftTotals(twoCityTemplate) {
        const totals = {};
        this.SHIFT_KEYS_WITH_NIGHT.forEach((shift) => {
            let min = 0;
            let max = 0;
            let avg = 0;
            const sharedRows = [];

            this.TWO_CITY_ROW_DEFS.forEach((row) => {
                const parsed = this.parseTemplateCell(twoCityTemplate?.[row.key]?.[shift]);
                if (parsed.isShared) {
                    sharedRows.push({ rowKey: row.key, ...parsed });
                } else {
                    min += parsed.min;
                    max += parsed.max;
                    avg += parsed.avg;
                }
            });

            const used = new Set();
            sharedRows.forEach((item, idx) => {
                if (used.has(idx)) return;
                let pairIdx = -1;
                for (let j = idx + 1; j < sharedRows.length; j++) {
                    if (used.has(j)) continue;
                    const other = sharedRows[j];
                    if (item.a === other.b && item.b === other.a) {
                        pairIdx = j;
                        break;
                    }
                }

                if (pairIdx >= 0) {
                    const other = sharedRows[pairIdx];
                    const comboA = item.a + other.a;
                    const comboB = item.b + other.b;
                    min += Math.min(comboA, comboB);
                    max += Math.max(comboA, comboB);
                    avg += (comboA + comboB) / 2;
                    used.add(idx);
                    used.add(pairIdx);
                    return;
                }

                min += item.min;
                max += item.max;
                avg += item.avg;
                used.add(idx);
            });

            totals[shift] = { min, max, avg };
        });
        return totals;
    },

    formatShiftTotalRange(total) {
        if (!total || typeof total !== 'object') return '0';
        const min = this.normalizePositiveInt(total.min, 0);
        const max = this.normalizePositiveInt(total.max, 0);
        if (min === max) return String(min);
        return `${min}/${max}`;
    },

    computeShanghaiDerivedFromTwoCity(twoCityTemplate, cityRatio) {
        const safeTemplate = this.normalizeTwoCityTemplate(twoCityTemplate);
        const safeRatio = this.normalizeCityRatio(cityRatio);
        const shiftTotals = this.computeTwoCityShiftTotals(safeTemplate);
        const shiftShare = { SH: {}, CD: {} };

        this.SHIFT_KEYS.forEach((shift) => {
            const sh = this.normalizePositiveInt(safeRatio.SH?.[shift], 0);
            const cd = this.normalizePositiveInt(safeRatio.CD?.[shift], 0);
            const total = sh + cd;
            shiftShare.SH[shift] = total > 0 ? (sh / total) : 0;
            shiftShare.CD[shift] = total > 0 ? (cd / total) : 0;
        });

        const cityShiftReference = { SH: {}, CD: {} };
        const allShiftReference = {};
        this.SHIFT_KEYS.forEach((shift) => {
            const avgTotal = Number(shiftTotals?.[shift]?.avg) || 0;
            cityShiftReference.SH[shift] = Math.max(0, Math.round(avgTotal * (shiftShare.SH[shift] || 0)));
            cityShiftReference.CD[shift] = Math.max(0, Math.round(avgTotal * (shiftShare.CD[shift] || 0)));
            allShiftReference[shift] = Math.max(0, Math.round(avgTotal));
        });

        const functionBaselineByCity = { SH: {}, CD: {}, ALL: {} };
        this.FUNCTION_KEYS.forEach((f) => {
            functionBaselineByCity.SH[f] = 0;
            functionBaselineByCity.CD[f] = 0;
            functionBaselineByCity.ALL[f] = 0;
        });

        this.TWO_CITY_ROW_DEFS.forEach((row) => {
            this.SHIFT_KEYS.forEach((shift) => {
                const parsed = this.parseTemplateCell(safeTemplate?.[row.key]?.[shift]);
                if (parsed.avg <= 0) return;
                const shValue = parsed.avg * (shiftShare.SH[shift] || 0);
                const cdValue = parsed.avg * (shiftShare.CD[shift] || 0);
                Object.entries(row.functionWeights || {}).forEach(([fn, weight]) => {
                    const w = Number(weight);
                    if (!Number.isFinite(w) || w <= 0) return;
                    if (!Object.prototype.hasOwnProperty.call(functionBaselineByCity.SH, fn)) {
                        functionBaselineByCity.SH[fn] = 0;
                        functionBaselineByCity.CD[fn] = 0;
                        functionBaselineByCity.ALL[fn] = 0;
                    }
                    functionBaselineByCity.SH[fn] += shValue * w;
                    functionBaselineByCity.CD[fn] += cdValue * w;
                    functionBaselineByCity.ALL[fn] += (shValue + cdValue) * w;
                });
            });
        });

        const computeRatio = (baseline) => {
            const total = Object.values(baseline || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
            const ratio = {};
            Object.keys(baseline || {}).forEach((fn) => {
                const v = Number(baseline[fn]) || 0;
                baseline[fn] = Math.max(0, Number(v.toFixed(4)));
                ratio[fn] = total > 0 ? Number(((v / total) * 100).toFixed(2)) : 0;
            });
            return ratio;
        };
        const functionRatioByCity = {
            SH: computeRatio(functionBaselineByCity.SH),
            CD: computeRatio(functionBaselineByCity.CD),
            ALL: computeRatio(functionBaselineByCity.ALL)
        };

        return {
            twoCityTemplate: safeTemplate,
            cityRatio: safeRatio,
            shiftTotals,
            shiftShare,
            cityShiftReference,
            allShiftReference,
            shanghaiShiftReference: cityShiftReference.SH,
            functionBaselineByCity,
            functionRatioByCity,
            functionBaseline: functionBaselineByCity.SH,
            functionRatio: functionRatioByCity.SH,
            functionRatioAll: functionRatioByCity.ALL
        };
    },

    refreshTwoCityDerived(config) {
        if (!config || typeof config !== 'object') return;
        const derived = this.computeShanghaiDerivedFromTwoCity(
            config.twoCityTemplate,
            config.cityRatio
        );
        config.twoCityTemplate = derived.twoCityTemplate;
        config.cityRatio = derived.cityRatio;
        config.shanghaiFunctionBaseline = derived.functionBaseline;
        config.shanghaiFunctionRatio = derived.functionRatio;
        config.twoCityDerived = {
            shiftTotals: derived.shiftTotals,
            shiftShare: derived.shiftShare,
            cityShiftReference: derived.cityShiftReference,
            allShiftReference: derived.allShiftReference,
            shanghaiShiftReference: derived.shanghaiShiftReference,
            functionRatioByCity: derived.functionRatioByCity,
            functionRatioAll: derived.functionRatioAll,
            generatedAt: new Date().toISOString()
        };
    },

    showMinimumManpowerConfig() {
        const scheduleConfig = (typeof Store !== 'undefined' ? Store.getState('scheduleConfig') : null) || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) {
            this.renderNoSchedule();
            return;
        }

        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const currentConfig = this.ensureConfig(dateList, scheduleConfig);
        this.render(currentConfig, dateList, scheduleConfig);
    },

    renderNoSchedule() {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;
        scheduleTable.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <p class="text-lg font-semibold">请先配置排班周期</p>
                <p class="mt-2 text-sm">进入“排班周期管理”设置开始和结束日期后再配置每日最低人力。</p>
            </div>
        `;
    },

    getDateList(startDateStr, endDateStr) {
        const list = [];
        const cursor = new Date(startDateStr);
        const end = new Date(endDateStr);
        while (cursor <= end) {
            const dateStr = this.formatDate(cursor);
            list.push({
                dateStr,
                day: cursor.getDate(),
                month: cursor.getMonth() + 1,
                weekday: cursor.getDay()
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        return list;
    },

    formatDate(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    buildPeriodKey(scheduleConfig) {
        return `${scheduleConfig.startDate}_${scheduleConfig.endDate}`;
    },

    normalizePositiveInt(value, fallback = 0) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(0, Math.floor(n));
    },

    createDayDemand(template) {
        const demand = {};
        this.SHIFT_KEYS.forEach((shift) => {
            demand[shift] = this.normalizePositiveInt(template[shift], 0);
        });
        return demand;
    },

    cloneConfig(config) {
        return JSON.parse(JSON.stringify(config));
    },

    firstFinite(values) {
        for (let i = 0; i < values.length; i++) {
            const n = Number(values[i]);
            if (Number.isFinite(n)) return n;
        }
        return null;
    },

    getUpdateStatusFn() {
        if (typeof StatusUtils !== 'undefined' && StatusUtils.updateStatus) {
            return StatusUtils.updateStatus.bind(StatusUtils);
        }
        if (typeof updateStatus === 'function') {
            return updateStatus;
        }
        return null;
    },

    getAlgorithmExtraAllowance() {
        if (typeof Store === 'undefined') return 1;
        const activeCfg = typeof Store.getActiveMonthlyScheduleConfig === 'function'
            ? Store.getActiveMonthlyScheduleConfig()
            : null;
        const raw = activeCfg && activeCfg.algorithmConfig
            ? activeCfg.algorithmConfig.maxExtraDayPerStaff
            : null;
        const n = Number(raw);
        if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
        return 1;
    },

    normalizeExtraWorkPlan(rawPlan) {
        const plan = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
        const staffExtraDays = {};
        if (plan.staffExtraDays && typeof plan.staffExtraDays === 'object') {
            Object.keys(plan.staffExtraDays).forEach((sid) => {
                const key = String(sid).trim();
                if (!key) return;
                const v = this.normalizePositiveInt(plan.staffExtraDays[sid], 0);
                if (v > 0) {
                    staffExtraDays[key] = v;
                }
            });
        }
        return {
            enabled: plan.enabled === true,
            mode: plan.mode || 'staffSpecific',
            staffExtraDays,
            stage: plan.stage || 'none',
            updatedAt: plan.updatedAt || null
        };
    },

    getExtraWorkPlan(config) {
        if (!config || typeof config !== 'object') {
            return this.normalizeExtraWorkPlan(null);
        }
        return this.normalizeExtraWorkPlan(config.extraWorkPlan);
    },

    setExtraWorkPlan(config, plan) {
        if (!config || typeof config !== 'object') return;
        const normalized = this.normalizeExtraWorkPlan(plan);
        config.extraWorkPlan = {
            ...normalized,
            updatedAt: new Date().toISOString()
        };
    },

    clearExtraWorkPlan(config) {
        if (!config || typeof config !== 'object') return;
        config.extraWorkPlan = {
            enabled: false,
            mode: 'staffSpecific',
            staffExtraDays: {},
            stage: 'none',
            updatedAt: new Date().toISOString()
        };
    },

    normalizeCompensationPlan(rawPlan) {
        const plan = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
        return {
            enabled: plan.enabled === true,
            reductionMode: plan.reductionMode === 'B' ? 'B' : 'A',
            targetGap: this.normalizePositiveInt(plan.targetGap, 0),
            m: this.normalizePositiveInt(plan.m, 0),
            n: this.normalizePositiveInt(plan.n, 0),
            l: this.normalizePositiveInt(plan.l, 0),
            updatedAt: plan.updatedAt || null,
            details: (plan.details && typeof plan.details === 'object') ? plan.details : {}
        };
    },

    getCompensationPlan(config) {
        if (!config || typeof config !== 'object') {
            return this.normalizeCompensationPlan(null);
        }
        return this.normalizeCompensationPlan(config.compensationPlan);
    },

    setCompensationPlan(config, plan) {
        if (!config || typeof config !== 'object') return;
        const normalized = this.normalizeCompensationPlan(plan);
        config.compensationPlan = {
            ...normalized,
            updatedAt: new Date().toISOString()
        };
    },

    clearCompensationPlan(config) {
        if (!config || typeof config !== 'object') return;
        config.compensationPlan = {
            enabled: false,
            reductionMode: 'A',
            targetGap: 0,
            m: 0,
            n: 0,
            l: 0,
            updatedAt: new Date().toISOString(),
            details: {}
        };
    },

    restoreDemandFromCompensationBase(config) {
        if (!config || typeof config !== 'object') return false;
        const comp = this.getCompensationPlan(config);
        const base = comp && comp.details && comp.details.baseDailyDemand;
        if (!base || typeof base !== 'object') return false;
        config.dailyDemand = this.cloneConfig(base);
        return true;
    },

    buildCompositeBaselineConfig(config) {
        const baseline = this.cloneConfig(config || {});
        const restored = this.restoreDemandFromCompensationBase(baseline);
        if (restored) {
            this.clearExtraWorkPlan(baseline);
            this.clearCompensationPlan(baseline);
        }
        return baseline;
    },

    countExtraPlanDays(extraWorkPlan) {
        const plan = this.normalizeExtraWorkPlan(extraWorkPlan);
        return Object.values(plan.staffExtraDays || {}).reduce((sum, days) => {
            return sum + this.normalizePositiveInt(days, 0);
        }, 0);
    },

    getEffectivePersonalRequests() {
        if (typeof Store === 'undefined') return {};
        const activeRequestConfigId = Store.getState('activeRequestConfigId');
        if (activeRequestConfigId && typeof Store.getRequestConfig === 'function') {
            const cfg = Store.getRequestConfig(activeRequestConfigId);
            if (cfg && cfg.personalRequestsSnapshot) {
                return cfg.personalRequestsSnapshot;
            }
        }
        return (typeof Store.getAllPersonalRequests === 'function')
            ? (Store.getAllPersonalRequests() || {})
            : (Store.getState('personalRequests') || {});
    },

    isBlockedByRequestType(type) {
        return type === 'REQ' || type === 'REST' || type === 'ANNUAL' || type === 'LEGAL' || type === 'SICK';
    },

    resolveNightShiftTypeMap(dateSet = null) {
        const map = {};
        const setType = (staffId, dateStr, type) => {
            if (!staffId || !dateStr || !type) return;
            if (dateSet && !dateSet.has(dateStr)) return;
            const sid = String(staffId).trim();
            if (!sid) return;
            if (!map[sid]) map[sid] = {};
            const prev = map[sid][dateStr];
            if (prev === 'night') return;
            if (type === 'night') {
                map[sid][dateStr] = 'night';
                return;
            }
            if (!prev) map[sid][dateStr] = 'rest';
        };

        const applySchedule = (schedule) => {
            if (!schedule || typeof schedule !== 'object') return;
            const firstKey = Object.keys(schedule)[0];
            if (!firstKey) return;
            const firstVal = schedule[firstKey];
            const isDateFormat = Array.isArray(firstVal);

            if (isDateFormat) {
                Object.keys(schedule).forEach((dateStr) => {
                    const rows = schedule[dateStr] || [];
                    rows.forEach((a) => {
                        if (!a || !a.staffId) return;
                        const shiftType = a.shiftType || '';
                        const isNight = shiftType === 'night' || shiftType === 'NIGHT';
                        const isRest = shiftType === 'rest' || a.isPostShiftRest === true;
                        if (isNight) setType(a.staffId, dateStr, 'night');
                        else if (isRest) setType(a.staffId, dateStr, 'rest');
                    });
                });
                return;
            }

            Object.keys(schedule).forEach((staffId) => {
                const row = schedule[staffId] || {};
                if (!row || typeof row !== 'object') return;
                Object.keys(row).forEach((dateStr) => {
                    const v = row[dateStr];
                    if (v === 'NIGHT' || v === 'night') setType(staffId, dateStr, 'night');
                    if (v === 'rest' || v === 'REST') setType(staffId, dateStr, 'rest');
                });
            });
        };

        if (typeof NightShiftManager !== 'undefined' && NightShiftManager.currentSchedule) {
            applySchedule(NightShiftManager.currentSchedule);
        }

        if (Object.keys(map).length === 0 && typeof Store !== 'undefined') {
            const activeCfg = typeof Store.getActiveNightShiftConfig === 'function'
                ? Store.getActiveNightShiftConfig()
                : null;
            if (activeCfg && activeCfg.schedule) {
                applySchedule(activeCfg.schedule);
            }
        }

        return map;
    },

    computeMergePotential(config, dateList) {
        const byDate = {};
        let total = 0;

        dateList.forEach((item) => {
            const dateStr = item.dateStr;
            const row = config.dailyDemand[dateStr] || {};
            let count = 0;
            this.MERGE_RULES.forEach((rule) => {
                const a = this.normalizePositiveInt(row[rule.primary], 0);
                const b = this.normalizePositiveInt(row[rule.secondary], 0);
                if (a > 0 && b > 0) count += 1;
            });
            byDate[dateStr] = count;
            total += count;
        });

        return { total, byDate };
    },

    buildManpowerGapAnalysis(config, dateList, cityScope = null) {
        const normalizedScope = (typeof CityUtils !== 'undefined' && CityUtils.normalizeCityScope)
            ? CityUtils.normalizeCityScope(cityScope || this.activeRenderCityScope || this.getActiveCityScope(), 'ALL')
            : String(cityScope || this.activeRenderCityScope || this.getActiveCityScope() || 'ALL').toUpperCase();
        const totals = this.computeTotals(config, dateList, normalizedScope);
        const totalDemand = totals.totalAll;
        const allStaffList = (typeof Store !== 'undefined' && typeof Store.getCurrentStaffData === 'function')
            ? (Store.getCurrentStaffData() || [])
            : [];
        const staffList = normalizedScope === 'ALL'
            ? allStaffList
            : allStaffList.filter((staff) => {
                if (typeof CityUtils !== 'undefined' && CityUtils.normalizeStaffCityFields) {
                    const normalized = CityUtils.normalizeStaffCityFields(staff || {}, 'SH');
                    return normalized.city === normalizedScope;
                }
                const raw = String((staff && (staff.city || staff.location)) || '').toUpperCase();
                return normalizedScope === 'CD'
                    ? (raw.includes('CD') || raw.includes('成都'))
                    : !(raw.includes('CD') || raw.includes('成都'));
            });
        const requests = this.getEffectivePersonalRequests();
        const restDays = (typeof Store !== 'undefined' && typeof Store.getAllRestDays === 'function')
            ? (Store.getAllRestDays() || {})
            : ((typeof Store !== 'undefined' ? (Store.getState('restDays') || {}) : {}));
        const dateSet = new Set(dateList.map(d => d.dateStr));
        const nightTypeMap = this.resolveNightShiftTypeMap(dateSet);
        const hasNightConfigRef = (typeof Store !== 'undefined')
            ? !!Store.getState('activeNightShiftConfigId')
            : false;
        const hasNightRuntimeRef = (typeof NightShiftManager !== 'undefined'
            && NightShiftManager.currentSchedule
            && Object.keys(NightShiftManager.currentSchedule).length > 0);
        const nightDataReady = Object.keys(nightTypeMap).length > 0 || hasNightConfigRef || hasNightRuntimeRef;
        const extraWorkPlan = this.getExtraWorkPlan(config);
        const compensationPlan = this.getCompensationPlan(config);
        const personalVacationTypeSet = new Set(this.PERSONAL_VACATION_TYPES || []);

        const restDayCount = dateList.reduce((sum, item) => {
            return sum + (restDays[item.dateStr] === true ? 1 : 0);
        }, 0);

        let baseWhiteCapacity = 0;
        let plannedWhiteCapacity = 0;
        const perStaffCapacity = {};
        const staffCycleRows = [];
        const extraPlanDays = this.countExtraPlanDays(extraWorkPlan);

        staffList.forEach((staff) => {
            const sid = String(staff.staffId || staff.id || '').trim();
            if (!sid) return;

            const name = staff.staffName || staff.name || sid;
            const req = requests[sid] || {};
            const nightRow = nightTypeMap[sid] || {};
            const directTarget = this.firstFinite([
                staff.targetDayShiftDays,
                staff.expectedDayShiftDays,
                staff.dayShiftTarget,
                staff.dayShiftDays,
                staff['应上白班天数']
            ]);

            let nightDays = 0;
            let nightBlockedDays = 0;
            Object.keys(nightRow || {}).forEach((ds) => {
                if (!dateSet.has(ds)) return;
                const t = nightRow[ds];
                if (t) nightBlockedDays += 1;
                if (t === 'night') nightDays += 1;
            });

            let personalVacationDays = 0;
            let annualOnWorkday = 0;
            Object.keys(req || {}).forEach((ds) => {
                if (!dateSet.has(ds)) return;
                const reqType = req[ds];
                if (personalVacationTypeSet.has(reqType)) {
                    personalVacationDays += 1;
                }
                if (reqType === 'ANNUAL' && restDays[ds] !== true) {
                    annualOnWorkday += 1;
                }
            });

            let expectedDayShiftDays = 0;
            if (directTarget != null) {
                expectedDayShiftDays = Math.max(0, Math.floor(Number(directTarget)));
            } else {
                // 与“月度班次配置”同口径：总天数 - 全局休息日 - 年假(工作日) - 大夜天数
                expectedDayShiftDays = Math.max(0, dateList.length - restDayCount - annualOnWorkday - nightDays);
            }

            const planExtra = this.normalizePositiveInt(extraWorkPlan.staffExtraDays[sid], 0);
            const plannedMaxWhiteDays = Math.max(0, expectedDayShiftDays + (extraWorkPlan.enabled ? planExtra : 0));
            perStaffCapacity[sid] = plannedMaxWhiteDays;
            baseWhiteCapacity += expectedDayShiftDays;
            plannedWhiteCapacity += plannedMaxWhiteDays;

            const expectedRestDays = Math.max(0, dateList.length - nightDays - expectedDayShiftDays);
            staffCycleRows.push({
                staffId: sid,
                staffName: name,
                totalDays: dateList.length,
                nightDays,
                nightBlockedDays,
                personalVacationDays,
                expectedRestDays,
                expectedDayShiftDays,
                plannedExtraDays: extraWorkPlan.enabled ? planExtra : 0,
                plannedMaxWhiteDays
            });
        });

        const dailyGapRows = [];
        let structuralGapSum = 0;

        dateList.forEach((item) => {
            const ds = item.dateStr;
            const row = config.dailyDemand[ds] || {};
            let dayDemand = 0;
            this.SHIFT_KEYS.forEach((s) => {
                dayDemand += this.projectScopedShiftValue(
                    row[s],
                    s,
                    normalizedScope,
                    config.cityRatio
                );
            });

            let available = 0;
            staffList.forEach((staff) => {
                const sid = String(staff.staffId || staff.id || '').trim();
                if (!sid) return;
                if (nightTypeMap[sid] && nightTypeMap[sid][ds]) return;
                const reqType = requests[sid] && requests[sid][ds];
                if (this.isBlockedByRequestType(reqType)) return;
                available += 1;
            });

            const dayGap = Math.max(0, dayDemand - available);
            if (dayGap > 0) {
                structuralGapSum += dayGap;
                dailyGapRows.push({ dateStr: ds, demand: dayDemand, available, gap: dayGap });
            }
        });

        dailyGapRows.sort((a, b) => {
            if (b.gap !== a.gap) return b.gap - a.gap;
            return String(a.dateStr).localeCompare(String(b.dateStr));
        });

        const capacityGapBase = Math.max(0, totalDemand - baseWhiteCapacity);
        const capacityGap = Math.max(0, totalDemand - plannedWhiteCapacity);
        const lowerBoundGap = Math.max(capacityGap, structuralGapSum);
        const surplusByCapacity = Math.max(0, plannedWhiteCapacity - totalDemand);
        const mergePotential = this.computeMergePotential(config, dateList);
        const postMergeGapEstimate = Math.max(0, lowerBoundGap - mergePotential.total);

        return {
            staffCount: staffList.length,
            totalDemand,
            baseWhiteCapacity,
            maxWhiteCapacity: plannedWhiteCapacity,
            capacityGap,
            capacityGapBase,
            equationGap: capacityGapBase,
            structuralGapSum,
            lowerBoundGap,
            surplusByCapacity,
            extraPlanDays,
            mergePotentialTotal: mergePotential.total,
            mergePotentialByDate: mergePotential.byDate,
            postMergeGapEstimate,
            dailyGapRows,
            extraWorkPlan,
            compensationPlan,
            perStaffCapacity,
            staffCycleRows,
            nightDataReady
        };
    },

    getMatchedSchedulePeriodConfig(scheduleConfig) {
        if (!scheduleConfig || typeof Store === 'undefined') return null;

        const isMatched = (config) => {
            const period = config && config.scheduleConfig;
            return !!(period
                && period.startDate === scheduleConfig.startDate
                && period.endDate === scheduleConfig.endDate);
        };

        if (typeof Store.getActiveSchedulePeriodConfig === 'function') {
            const active = Store.getActiveSchedulePeriodConfig();
            if (isMatched(active)) {
                return active;
            }
        }

        if (typeof Store.getSchedulePeriodConfigs === 'function') {
            const list = Store.getSchedulePeriodConfigs() || [];
            const matched = list.find(isMatched);
            if (matched) return matched;
        }

        return null;
    },

    getHolidayNameByDate(dateStr) {
        const holidayName = (typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName)
            ? (HolidayManager.getHolidayName(dateStr) || '')
            : '';
        if (holidayName) return holidayName;
        if (typeof LunarHolidays !== 'undefined' && LunarHolidays.getHoliday) {
            return LunarHolidays.getHoliday(dateStr) || '';
        }
        return '';
    },

    parseDateStr(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return new Date(dateStr);
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    },

    isDefaultHolidayRest(dateStr, holidayName) {
        if (holidayName && ['元旦', '清明', '五一', '端午', '中秋', '春节'].includes(holidayName)) {
            return true;
        }
        if (holidayName === '国庆') {
            const date = new Date(dateStr);
            const month = date.getMonth() + 1;
            const day = date.getDate();
            if (month === 10 && day >= 1 && day <= 3) {
                return true;
            }
        }
        return false;
    },

    getRestDaysSnapshotForSchedule(scheduleConfig) {
        const matchedPeriodConfig = this.getMatchedSchedulePeriodConfig(scheduleConfig);
        if (matchedPeriodConfig && matchedPeriodConfig.restDaysSnapshot) {
            return matchedPeriodConfig.restDaysSnapshot;
        }
        return {};
    },

    isSpecialHolidayDate(dateStr) {
        const holidayName = this.getHolidayNameByDate(dateStr);
        const isFixedHoliday = (typeof HolidayManager !== 'undefined' && HolidayManager.isFixedHoliday)
            ? HolidayManager.isFixedHoliday(dateStr)
            : false;
        return {
            isSpecial: !!holidayName || isFixedHoliday,
            holidayName
        };
    },

    getEffectiveRestFlag(item, restDaysSnapshot) {
        const hasExplicitRest = Object.prototype.hasOwnProperty.call(restDaysSnapshot, item.dateStr);
        const isWeekend = item.weekday === 0 || item.weekday === 6;
        const holidayName = this.getHolidayNameByDate(item.dateStr);
        const isDefaultHolidayRest = this.isDefaultHolidayRest(item.dateStr, holidayName);
        return hasExplicitRest ? restDaysSnapshot[item.dateStr] === true : (isDefaultHolidayRest || isWeekend);
    },

    getSpringFestivalPreDaysFromSchedulePeriod(dateList, scheduleConfig) {
        const result = {
            hasSpringHoliday: false,
            preDays: new Set()
        };
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            return result;
        }

        const restDaysSnapshot = this.getRestDaysSnapshotForSchedule(scheduleConfig);
        const inPeriodSet = new Set(dateList.map(item => item.dateStr));
        const extensionDays = 14;
        const extStart = this.parseDateStr(scheduleConfig.startDate);
        extStart.setDate(extStart.getDate() - extensionDays);
        const extEnd = this.parseDateStr(scheduleConfig.endDate);
        extEnd.setDate(extEnd.getDate() + extensionDays);
        const fullDateList = this.getDateList(this.formatDate(extStart), this.formatDate(extEnd));
        if (fullDateList.length === 0) {
            return result;
        }

        const springFlags = fullDateList.map(item => this.getHolidayNameByDate(item.dateStr) === '春节');
        const hasSpringInPeriod = fullDateList.some((item, idx) => springFlags[idx] && inPeriodSet.has(item.dateStr));
        if (!hasSpringInPeriod) {
            return result;
        }
        result.hasSpringHoliday = true;

        const restFlags = fullDateList.map(item => this.getEffectiveRestFlag(item, restDaysSnapshot));
        const connectedToSpring = new Array(fullDateList.length).fill(false);

        springFlags.forEach((isSpring, startIdx) => {
            if (!isSpring) return;

            connectedToSpring[startIdx] = true;

            for (let i = startIdx - 1; i >= 0; i--) {
                if (restFlags[i]) {
                    connectedToSpring[i] = true;
                } else {
                    break;
                }
            }

            for (let i = startIdx + 1; i < fullDateList.length; i++) {
                if (restFlags[i]) {
                    connectedToSpring[i] = true;
                } else {
                    break;
                }
            }
        });

        const springBlockDatesInPeriod = fullDateList
            .filter((item, idx) => connectedToSpring[idx] && restFlags[idx] && inPeriodSet.has(item.dateStr))
            .map(item => item.dateStr);
        if (springBlockDatesInPeriod.length === 0) {
            return result;
        }

        // 规则：取春节红色假期块的前3天（即该假期块起始连续3天）
        springBlockDatesInPeriod.slice(0, 3).forEach((ds) => {
            result.preDays.add(ds);
        });

        return result;
    },

    getDateHeaderStyleMap(dateList, scheduleConfig) {
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            return {};
        }
        const restDaysSnapshot = this.getRestDaysSnapshotForSchedule(scheduleConfig);
        const extensionDays = 7;
        const extStart = this.parseDateStr(scheduleConfig.startDate);
        extStart.setDate(extStart.getDate() - extensionDays);
        const extEnd = this.parseDateStr(scheduleConfig.endDate);
        extEnd.setDate(extEnd.getDate() + extensionDays);
        const fullDateList = this.getDateList(this.formatDate(extStart), this.formatDate(extEnd));
        const fullIndexMap = new Map();
        fullDateList.forEach((item, idx) => fullIndexMap.set(item.dateStr, idx));

        const specialFlags = fullDateList.map(item => this.isSpecialHolidayDate(item.dateStr).isSpecial);
        const restFlags = fullDateList.map(item => this.getEffectiveRestFlag(item, restDaysSnapshot));
        const connectedToSpecial = new Array(fullDateList.length).fill(false);

        specialFlags.forEach((isSpecial, idx) => {
            if (isSpecial) connectedToSpecial[idx] = true;
        });

        for (let i = 1; i < fullDateList.length; i++) {
            if (restFlags[i] && (connectedToSpecial[i - 1] || specialFlags[i - 1])) {
                connectedToSpecial[i] = true;
            }
        }

        for (let i = fullDateList.length - 2; i >= 0; i--) {
            if (restFlags[i] && (connectedToSpecial[i + 1] || specialFlags[i + 1])) {
                connectedToSpecial[i] = true;
            }
        }

        const styleMap = {};
        dateList.forEach((item) => {
            const idx = fullIndexMap.get(item.dateStr);
            const holidayInfo = this.isSpecialHolidayDate(item.dateStr);
            const isSpecial = idx !== undefined ? specialFlags[idx] : holidayInfo.isSpecial;
            const isRestDay = idx !== undefined ? restFlags[idx] : this.getEffectiveRestFlag(item, restDaysSnapshot);
            const isConnected = idx !== undefined ? connectedToSpecial[idx] : false;
            const isRed = (isSpecial && isRestDay) || (isRestDay && isConnected);

            let bgColor = 'bg-gray-50';
            let textColor = 'text-gray-700';
            let borderColor = 'border-gray-300';
            if (isRed) {
                bgColor = 'bg-red-500';
                textColor = 'text-white';
                borderColor = 'border-red-600';
            } else if (isRestDay) {
                bgColor = 'bg-blue-400';
                textColor = 'text-white';
                borderColor = 'border-blue-500';
            }

            styleMap[item.dateStr] = {
                bgColor,
                textColor,
                borderColor,
                title: holidayInfo.holidayName ? `${item.dateStr} - ${holidayInfo.holidayName}` : item.dateStr,
                holidayName: holidayInfo.holidayName,
                holidayTextColor: textColor === 'text-white' ? 'text-white/90' : 'text-red-600'
            };
        });

        return styleMap;
    },

    getSpecialDateSet(dateList, scheduleConfig = null) {
        const years = new Set(dateList.map(item => Number(item.dateStr.slice(0, 4))));
        const allSpecials = new Set();
        const springInfo = this.getSpringFestivalPreDaysFromSchedulePeriod(dateList, scheduleConfig);

        springInfo.preDays.forEach(ds => allSpecials.add(ds));

        years.forEach((year) => {
            // 国庆前3天：9/28, 9/29, 9/30
            const nationalBase = new Date(year, 9, 1);
            for (let i = 1; i <= 3; i++) {
                const d = new Date(nationalBase);
                d.setDate(d.getDate() - i);
                allSpecials.add(this.formatDate(d));
            }

            // 兜底：当无法从排班周期配置定位春节假期时，退回到春节首日倒推
            if (!springInfo.hasSpringHoliday && typeof HolidayManager !== 'undefined' && HolidayManager.getHolidays) {
                const holidays = HolidayManager.getHolidays(year);
                const springDates = Object.keys(holidays)
                    .filter(ds => holidays[ds] === '春节')
                    .sort();
                if (springDates.length > 0) {
                    const springFirst = new Date(springDates[0]);
                    for (let i = 1; i <= 3; i++) {
                        const d = new Date(springFirst);
                        d.setDate(d.getDate() - i);
                        allSpecials.add(this.formatDate(d));
                    }
                }
            }
        });

        return allSpecials;
    },

    getWorkingConfig() {
        if (typeof Store !== 'undefined' && Store && typeof Store.getMinimumManpowerConfigForActiveLock === 'function') {
            const profileConfig = Store.getMinimumManpowerConfigForActiveLock();
            if (profileConfig && typeof profileConfig === 'object') {
                return this.cloneConfig(profileConfig);
            }
        }
        if (typeof Store !== 'undefined' && Store && typeof Store.getState === 'function') {
            const fallback = Store.getState('minimumManpowerConfig');
            if (fallback && typeof fallback === 'object') {
                return this.cloneConfig(fallback);
            }
        }
        return {};
    },

    ensureConfig(dateList, scheduleConfig) {
        const defaults = this.getDefaultTemplates();
        const periodKey = this.buildPeriodKey(scheduleConfig);
        const fromStore = this.getWorkingConfig();

        const baseConfig = (fromStore && Object.keys(fromStore).length > 0) ? fromStore : {
            periodKey,
            weekdayTemplate: defaults.weekdayTemplate,
            specialTemplate: defaults.specialTemplate,
            twoCityTemplate: this.getDefaultTwoCityTemplate(),
            cityRatio: this.getDefaultCityRatio(),
            cityShiftSplit: this.getDefaultCityShiftSplit(),
            scenarioSkillDemand: this.getDefaultScenarioSkillDemand(),
            twoCityTemplateSource: this.TWO_CITY_DEFAULT_VERSION,
            shanghaiFunctionBaseline: {},
            shanghaiFunctionRatio: {},
            twoCityDerived: {},
            dailyDemand: {}
        };

        if (!baseConfig.weekdayTemplate) baseConfig.weekdayTemplate = this.cloneConfig(defaults.weekdayTemplate);
        if (!baseConfig.specialTemplate) baseConfig.specialTemplate = this.cloneConfig(defaults.specialTemplate);
        if (!baseConfig.twoCityTemplate || typeof baseConfig.twoCityTemplate !== 'object' || Object.keys(baseConfig.twoCityTemplate).length === 0) {
            baseConfig.twoCityTemplate = this.getDefaultTwoCityTemplate();
            baseConfig.twoCityTemplateSource = this.TWO_CITY_DEFAULT_VERSION;
        }
        if (!baseConfig.cityRatio || typeof baseConfig.cityRatio !== 'object') {
            baseConfig.cityRatio = this.getDefaultCityRatio();
        }
        if (!baseConfig.cityShiftSplit || typeof baseConfig.cityShiftSplit !== 'object') {
            baseConfig.cityShiftSplit = this.getDefaultCityShiftSplit();
        }
        if (!baseConfig.scenarioSkillDemand || typeof baseConfig.scenarioSkillDemand !== 'object') {
            baseConfig.scenarioSkillDemand = this.getDefaultScenarioSkillDemand();
        }
        baseConfig.twoCityTemplate = this.normalizeTwoCityTemplate(baseConfig.twoCityTemplate);
        baseConfig.cityRatio = this.normalizeCityRatio(baseConfig.cityRatio);
        baseConfig.cityShiftSplit = this.normalizeCityShiftSplit(baseConfig.cityShiftSplit);
        baseConfig.scenarioSkillDemand = this.normalizeScenarioSkillDemand(baseConfig.scenarioSkillDemand);
        if (!baseConfig.dailyDemand) baseConfig.dailyDemand = {};

        const specialDateSet = this.getSpecialDateSet(dateList, scheduleConfig);
        const isPeriodChanged = baseConfig.periodKey !== periodKey;
        if (isPeriodChanged) {
            this.clearExtraWorkPlan(baseConfig);
            this.clearCompensationPlan(baseConfig);
        }
        const compPlan = this.getCompensationPlan(baseConfig);
        const extraPlan = this.getExtraWorkPlan(baseConfig);
        // 兼容旧逻辑残留：若未启用综合补缺方案，则清除历史“多上班”计划，避免口径被旧数据污染
        if (!compPlan.enabled && extraPlan.enabled) {
            this.clearExtraWorkPlan(baseConfig);
        }

        dateList.forEach((item) => {
            const isSpecial = specialDateSet.has(item.dateStr);
            const template = isSpecial ? baseConfig.specialTemplate : baseConfig.weekdayTemplate;
            if (isPeriodChanged || !baseConfig.dailyDemand[item.dateStr]) {
                baseConfig.dailyDemand[item.dateStr] = this.createDayDemand(template);
            } else {
                // 补全缺失字段
                this.SHIFT_KEYS.forEach((shift) => {
                    if (baseConfig.dailyDemand[item.dateStr][shift] === undefined) {
                        baseConfig.dailyDemand[item.dateStr][shift] = this.normalizePositiveInt(template[shift], 0);
                    } else {
                        baseConfig.dailyDemand[item.dateStr][shift] = this.normalizePositiveInt(baseConfig.dailyDemand[item.dateStr][shift], 0);
                    }
                });
            }
        });

        // 清理周期外历史日期
        const dateSet = new Set(dateList.map(d => d.dateStr));
        Object.keys(baseConfig.dailyDemand).forEach((ds) => {
            if (!dateSet.has(ds)) {
                delete baseConfig.dailyDemand[ds];
            }
        });

        baseConfig.periodKey = periodKey;
        this.refreshTwoCityDerived(baseConfig);
        this.persistConfig(baseConfig, false);
        return baseConfig;
    },

    persistConfig(config, autoSave = true) {
        if (typeof Store === 'undefined') return;
        const scope = config && config.cityScope ? this.normalizeCityScope(config.cityScope) : this.getActiveCityScope();
        const permission = this.checkMutationPermission({ silent: !autoSave, cityScope: scope });
        if (!permission.allowed) return;
        if (typeof Store.setMinimumManpowerConfigForActiveLock === 'function') {
            Store.setMinimumManpowerConfigForActiveLock(config, autoSave);
            return;
        }
        Store.updateState({ minimumManpowerConfig: config }, autoSave);
    },

    applyTemplateToDates(config, dateList, type, scheduleConfig = null) {
        const specialDateSet = this.getSpecialDateSet(dateList, scheduleConfig);
        const useSpecial = type === 'special';
        const template = useSpecial ? config.specialTemplate : config.weekdayTemplate;

        dateList.forEach((item) => {
            const isSpecial = specialDateSet.has(item.dateStr);
            if ((useSpecial && isSpecial) || (!useSpecial && !isSpecial)) {
                config.dailyDemand[item.dateStr] = this.createDayDemand(template);
            }
        });

        this.persistConfig(config, true);
    },

    updateTemplate(config, type) {
        const prefix = type === 'weekday' ? 'weekday' : 'special';
        const target = type === 'weekday' ? config.weekdayTemplate : config.specialTemplate;
        const activeScope = this.activeRenderCityScope || this.getActiveCityScope();

        this.SHIFT_KEYS.forEach((shift) => {
            const input = document.getElementById(`${prefix}-${shift}`);
            if (input) {
                const scopedValue = this.normalizePositiveInt(
                    input.value,
                    this.projectScopedShiftValue(target[shift], shift, activeScope, config.cityRatio)
                );
                target[shift] = this.mergeScopedShiftValue(
                    scopedValue,
                    target[shift],
                    shift,
                    activeScope,
                    config.cityRatio
                );
                input.value = this.projectScopedShiftValue(target[shift], shift, activeScope, config.cityRatio);
            }
        });

        this.persistConfig(config, true);
    },

    getShiftCellClass(item, specialDateSet) {
        return specialDateSet.has(item.dateStr)
            ? 'bg-amber-50 border-amber-200'
            : 'bg-blue-50 border-blue-200';
    },

    getDateHeaderStyle(item, styleMap = null) {
        if (styleMap && styleMap[item.dateStr]) {
            return styleMap[item.dateStr];
        }

        const dateObj = new Date(item.dateStr);
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const holidayName = (typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName)
            ? HolidayManager.getHolidayName(item.dateStr)
            : '';
        const lunarHoliday = !holidayName && typeof LunarHolidays !== 'undefined' && LunarHolidays.getHoliday
            ? (LunarHolidays.getHoliday(item.dateStr) || '')
            : '';
        const finalHolidayName = holidayName || lunarHoliday;
        const isHoliday = !!finalHolidayName;

        const bgColor = isHoliday ? 'bg-red-100' : isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
        const textColor = isHoliday ? 'text-red-700' : isWeekend ? 'text-yellow-700' : 'text-gray-700';
        const borderColor = isHoliday ? 'border-red-300' : isWeekend ? 'border-yellow-200' : 'border-gray-300';
        const title = finalHolidayName
            ? `${item.dateStr} - ${finalHolidayName}`
            : isWeekend
                ? `${item.dateStr} - 周末`
                : item.dateStr;

        return {
            bgColor,
            textColor,
            borderColor,
            title,
            holidayName: finalHolidayName,
            holidayTextColor: isHoliday ? 'text-red-600' : 'text-gray-600'
        };
    },

    computeTotals(config, dateList, cityScope = null) {
        const normalizedScope = (typeof CityUtils !== 'undefined' && CityUtils.normalizeCityScope)
            ? CityUtils.normalizeCityScope(cityScope || this.activeRenderCityScope || this.getActiveCityScope(), 'ALL')
            : String(cityScope || this.activeRenderCityScope || this.getActiveCityScope() || 'ALL').toUpperCase();
        const totalsByShift = {};
        this.SHIFT_KEYS.forEach((shift) => {
            totalsByShift[shift] = 0;
        });

        let totalAll = 0;
        dateList.forEach((item) => {
            const row = config.dailyDemand[item.dateStr] || {};
            this.SHIFT_KEYS.forEach((shift) => {
                const value = this.projectScopedShiftValue(
                    row[shift],
                    shift,
                    normalizedScope,
                    config.cityRatio
                );
                totalsByShift[shift] += value;
                totalAll += value;
            });
        });

        return { totalsByShift, totalAll };
    },

    render(config, dateList, scheduleConfig) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const activeCityScope = this.getActiveCityScope();
        this.activeRenderCityScope = activeCityScope;
        const activeCityName = this.getCityScopeDisplayName(activeCityScope);
        const activeLock = (typeof Store !== 'undefined' && Store && typeof Store.getActiveLockContext === 'function')
            ? Store.getActiveLockContext()
            : null;
        const activeLockMonth = (activeLock && activeLock.valid && activeLock.schedulePeriodConfig && activeLock.schedulePeriodConfig.scheduleConfig)
            ? `${activeLock.schedulePeriodConfig.scheduleConfig.year}${String(activeLock.schedulePeriodConfig.scheduleConfig.month).padStart(2, '0')}`
            : '-';
        const archiveEntries = this.getArchiveEntries(activeLock && activeLock.lockKey ? activeLock.lockKey : null);
        const specialDateSet = this.getSpecialDateSet(dateList, scheduleConfig);
        const headerStyleMap = this.getDateHeaderStyleMap(dateList, scheduleConfig);
        const totals = this.computeTotals(config, dateList, activeCityScope);
        const gapAnalysis = this.buildManpowerGapAnalysis(config, dateList, activeCityScope);
        const compositeBaselineConfig = this.buildCompositeBaselineConfig(config);
        const compositeGapAnalysis = this.buildManpowerGapAnalysis(compositeBaselineConfig, dateList, activeCityScope);

        const renderTemplateEditor = (label, prefix, template, actionLabel, actionType, styleClass) => {
            const inputs = this.SHIFT_KEYS.map(shift => `
                <div>
                    <label class="block text-xs text-gray-600 mb-1">${this.SHIFT_LABELS[shift]}</label>
                    <input id="${prefix}-${shift}" type="number" min="0" step="1"
                        class="w-full px-2 py-1 border rounded text-sm"
                        value="${this.projectScopedShiftValue(template[shift], shift, activeCityScope, config.cityRatio)}">
                </div>
            `).join('');

            return `
                <div class="border rounded-lg p-3 ${styleClass}">
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="text-sm font-semibold text-gray-800">${label}</h3>
                        <button class="px-3 py-1 text-xs text-white rounded ${actionType === 'weekday' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}"
                            onclick="MinimumManpowerManager.handleApplyTemplate('${actionType}')">
                            ${actionLabel}
                        </button>
                    </div>
                    <div class="grid grid-cols-5 gap-2">${inputs}</div>
                </div>
            `;
        };

        const renderDemandRows = this.SHIFT_KEYS.map(shift => {
            const cells = dateList.map(item => {
                const val = this.projectScopedShiftValue(
                    config.dailyDemand[item.dateStr]?.[shift],
                    shift,
                    activeCityScope,
                    config.cityRatio
                );
                const cellClass = this.getShiftCellClass(item, specialDateSet);
                const isEditing = this.editingCell && this.editingCell.dateStr === item.dateStr && this.editingCell.shift === shift;
                return `
                    <td class="border px-1 py-1 ${cellClass}">
                        ${
                            isEditing
                                ? `<div class="flex items-center justify-center gap-1 min-w-[120px]">
                                    <button class="w-6 h-6 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs"
                                        onmousedown="MinimumManpowerManager.preventEditingBlur(event)"
                                        onclick="MinimumManpowerManager.adjustEditingValue(-1)">-</button>
                                    <input id="${this.EDITING_INPUT_ID}" type="number" min="0" step="1"
                                        class="w-11 h-6 text-center text-xs border border-gray-300 rounded"
                                        value="${this.editingTempValue}"
                                        oninput="MinimumManpowerManager.setEditingValue(this.value)"
                                        onchange="MinimumManpowerManager.setEditingValue(this.value)">
                                    <button class="w-6 h-6 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs"
                                        onmousedown="MinimumManpowerManager.preventEditingBlur(event)"
                                        onclick="MinimumManpowerManager.adjustEditingValue(1)">+</button>
                                    <button class="w-8 h-6 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[10px] text-emerald-700"
                                        onmousedown="MinimumManpowerManager.preventEditingBlur(event)"
                                        onclick="MinimumManpowerManager.applyEditingValue()">确定</button>
                                    <button class="w-8 h-6 rounded border border-gray-300 bg-white hover:bg-gray-50 text-[10px] text-gray-600"
                                        onmousedown="MinimumManpowerManager.preventEditingBlur(event)"
                                        onclick="MinimumManpowerManager.cancelEditing()">取消</button>
                                </div>`
                                : `<button class="w-full min-w-[52px] py-1 rounded border border-transparent hover:border-indigo-300 hover:bg-indigo-50 text-sm font-semibold text-gray-800"
                                    onclick="MinimumManpowerManager.openCellEditor('${item.dateStr}','${shift}')"
                                    title="点击微调">${val}</button>`
                        }
                    </td>
                `;
            }).join('');

            return `
                <tr>
                    <th class="sticky left-0 z-10 bg-white border px-3 py-2 text-xs font-semibold text-gray-700">${this.SHIFT_LABELS[shift]}</th>
                    ${cells}
                </tr>
            `;
        }).join('');

        const headerCells = dateList.map(item => {
            const dateStyle = this.getDateHeaderStyle(item, headerStyleMap);
            return `
                <th class="border px-1 py-1 text-center text-xs font-medium ${dateStyle.textColor} ${dateStyle.borderColor} ${dateStyle.bgColor}" title="${dateStyle.title}">
                    <div class="text-xs font-bold">${item.day}</div>
                    ${dateStyle.holidayName ? `<div class="text-[10px] ${dateStyle.holidayTextColor || 'text-red-600'} font-semibold mt-0.5">${dateStyle.holidayName}</div>` : ''}
                </th>
            `;
        }).join('');

        const specialLegend = `
            <div class="text-xs text-gray-600 mt-2 flex items-center gap-3">
                <span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-200"></span>平日</span>
                <span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-200"></span>特殊节假日（春节假期前三天 / 国庆前三天）</span>
            </div>
        `;

        const totalShiftHtml = this.SHIFT_KEYS.map(shift => `
            <div class="px-3 py-2 bg-gray-50 rounded border text-sm">
                <span class="text-gray-600">${this.SHIFT_LABELS[shift]}</span>
                <span class="ml-2 font-semibold text-gray-800">${totals.totalsByShift[shift]}</span>
            </div>
        `).join('');

        const equationGap = this.normalizePositiveInt(compositeGapAnalysis.equationGap, 0);
        const hasGap = equationGap > 0 || this.normalizePositiveInt(gapAnalysis.structuralGapSum, 0) > 0;
        const gapPanelClass = hasGap
            ? 'border-red-200 bg-red-50/70'
            : 'border-emerald-200 bg-emerald-50/70';
        const gapTitleClass = hasGap ? 'text-red-700' : 'text-emerald-700';
        const gapHint = equationGap > 0
            ? `基于“应上白班天数”口径，当前缺口为 ${equationGap} 人天`
            : (gapAnalysis.structuralGapSum > 0
                ? `总量缺口为0，但存在结构缺口 ${gapAnalysis.structuralGapSum} 人天（部分日期可用人力不足）`
                : '当前供需可覆盖最低人力需求');
        const actionHint = equationGap > 0
            ? '可通过综合方案补缺：减少 m 天白班需求 + n 人多上1天 + l 人多上2天。'
            : '当前无缺口，可按需执行“富余增补”优化技能覆盖。';
        const topDailyGapHtml = gapAnalysis.dailyGapRows.length > 0
            ? gapAnalysis.dailyGapRows.slice(0, 5).map((r) => `
                <div class="text-xs text-gray-700">
                    ${r.dateStr}：需求${r.demand}，可用${r.available}，缺口<span class="font-semibold text-red-600">${r.gap}</span>
                </div>
            `).join('')
            : '<div class="text-xs text-gray-600">无结构性日缺口。</div>';
        const compensationPlan = gapAnalysis.compensationPlan || this.normalizeCompensationPlan(null);
        const compositeBounds = this.buildCompositeBounds(compositeBaselineConfig, dateList, compositeGapAnalysis);
        const selectedMode = compensationPlan.reductionMode === 'B' ? 'B' : 'A';
        const selectedMaxM = selectedMode === 'B' ? compositeBounds.maxReduceB : compositeBounds.maxReduceA;
        const suggestedComposite = this.suggestCompositePlan(compositeBounds.gap, selectedMaxM, compositeBounds.staffCount);
        const initComposite = (compensationPlan.enabled && compensationPlan.targetGap === compositeBounds.gap)
            ? {
                m: this.normalizePositiveInt(compensationPlan.m, suggestedComposite.m),
                n: this.normalizePositiveInt(compensationPlan.n, suggestedComposite.n),
                l: this.normalizePositiveInt(compensationPlan.l, suggestedComposite.l)
            }
            : suggestedComposite;
        const twoCityTemplate = this.normalizeTwoCityTemplate(config.twoCityTemplate);
        const cityRatio = this.normalizeCityRatio(config.cityRatio);
        const twoCityDerived = this.computeShanghaiDerivedFromTwoCity(twoCityTemplate, cityRatio);
        const twoCityRowsHtml = this.TWO_CITY_ROW_DEFS.map((row) => {
            const cells = this.SHIFT_KEYS_WITH_NIGHT.map((shift) => {
                const v = twoCityTemplate?.[row.key]?.[shift] ?? '';
                const isNight = shift === this.NIGHT_SHIFT_KEY;
                return `
                    <td class="border px-1 py-1 ${isNight ? 'bg-slate-50' : 'bg-white'}">
                        <input type="text"
                            value="${v}"
                            class="w-full px-1 py-1 border rounded text-xs text-center ${isNight ? 'bg-slate-100 text-slate-700' : ''}"
                            ${isNight ? 'readonly' : ''}
                            onchange="MinimumManpowerManager.handleTwoCityTemplateInput('${row.key}','${shift}',this.value)">
                    </td>
                `;
            }).join('');
            return `
                <tr>
                    <th class="border px-2 py-1 text-xs text-left font-semibold bg-gray-50">${row.label}</th>
                    ${cells}
                </tr>
            `;
        }).join('');
        const twoCityTotals = twoCityDerived.shiftTotals || {};
        const totalCellsHtml = this.SHIFT_KEYS_WITH_NIGHT.map((shift) => {
            const text = this.formatShiftTotalRange(twoCityTotals[shift]);
            return `<td class="border px-1 py-1 text-xs text-center font-semibold bg-amber-50">${text}</td>`;
        }).join('');
        const cityRatioRowsHtml = ['SH', 'CD'].map((cityKey) => {
            const cityLabel = cityKey === 'SH' ? '上海' : '成都';
            const cells = this.SHIFT_KEYS.map((shift) => `
                <td class="border px-1 py-1 bg-white">
                    <input type="number" min="0" step="1"
                        value="${cityRatio?.[cityKey]?.[shift] ?? 0}"
                        class="w-full px-1 py-1 border rounded text-xs text-center"
                        data-city-scope="${cityKey}"
                        onchange="MinimumManpowerManager.handleCityRatioInput('${cityKey}','${shift}',this.value)">
                </td>
            `).join('');
            return `
                <tr>
                    <th class="border px-2 py-1 text-xs text-left font-semibold bg-gray-50">${cityLabel}</th>
                    ${cells}
                </tr>
            `;
        }).join('');
        const cityRatioTotalCells = this.SHIFT_KEYS.map((shift) => {
            const total = this.normalizePositiveInt(cityRatio?.SH?.[shift], 0) + this.normalizePositiveInt(cityRatio?.CD?.[shift], 0);
            return `<td class="border px-1 py-1 text-xs text-center font-semibold bg-amber-50">${total}</td>`;
        }).join('');
        const referenceShiftMap = activeCityScope === 'ALL'
            ? (twoCityDerived?.allShiftReference || {})
            : (twoCityDerived?.cityShiftReference?.[activeCityScope] || twoCityDerived?.shanghaiShiftReference || {});
        const referenceFunctionRatioMap = activeCityScope === 'ALL'
            ? (twoCityDerived?.functionRatioAll || {})
            : (twoCityDerived?.functionRatioByCity?.[activeCityScope] || twoCityDerived?.functionRatio || {});
        const refShiftChips = this.SHIFT_KEYS.map((shift) => {
            const n = this.normalizePositiveInt(referenceShiftMap?.[shift], 0);
            return `<span class="inline-flex items-center px-2 py-0.5 rounded border bg-white text-xs">${shift}:${n}</span>`;
        }).join('');
        const ratioChips = this.FUNCTION_KEYS.map((fn) => {
            const p = Number(referenceFunctionRatioMap?.[fn] || 0);
            if (p <= 0) return '';
            return `<span class="inline-flex items-center px-2 py-0.5 rounded border bg-white text-xs">${fn}:${p}%</span>`;
        }).join('');
        const scenarioSkillDemand = this.normalizeScenarioSkillDemand(config.scenarioSkillDemand);
        const scenarioTotals = this.computeScenarioTotals(scenarioSkillDemand);
        const scenarioColumns = this.SCENARIO_COLUMNS.map((key) => ({
            key,
            label: this.SCENARIO_COLUMN_LABELS[key] || key
        }));
        const scenarioRowsHtml = Object.keys(scenarioSkillDemand).map((skillKey) => {
            const cells = scenarioColumns.map((col) => `
                <td class="border px-1 py-1 bg-white">
                    <input type="number" min="0" step="1"
                        value="${this.normalizePositiveInt(scenarioSkillDemand?.[skillKey]?.[col.key], 0)}"
                        class="w-full px-1 py-1 border rounded text-xs text-center"
                        onchange="MinimumManpowerManager.handleScenarioSkillDemandInput('${skillKey}','${col.key}',this.value)">
                </td>
            `).join('');
            return `
                <tr>
                    <th class="border px-2 py-1 text-xs text-left font-semibold bg-gray-50 whitespace-nowrap">${skillKey}</th>
                    ${cells}
                </tr>
            `;
        }).join('');
        const scenarioTotalCellsHtml = scenarioColumns.map((col) => `
            <td class="border px-1 py-1 text-xs text-center font-semibold bg-amber-50">
                ${this.normalizePositiveInt(scenarioTotals?.[col.key], 0)}
            </td>
        `).join('');
        const twoCityPanelHtml = `
            <div class="border rounded-lg p-3 bg-white space-y-3">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 class="text-sm font-semibold text-gray-800">当月两地人力安排表</h3>
                        <p class="text-xs text-gray-600 mt-1">说明：<code>0/1</code>、<code>1/0</code> 表示同日同列共享 1 人次（相加=1）；夜班列仅展示，不参与白班分配。</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="px-3 py-1.5 text-xs rounded bg-gray-700 text-white hover:bg-gray-800"
                            onclick="MinimumManpowerManager.handleResetTwoCityTemplateDefault()">
                            恢复示例默认
                        </button>
                        <button class="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                            onclick="MinimumManpowerManager.handleApplyShanghaiReferenceToTemplates()">
                            按两地比例折算并应用到平日模板
                        </button>
                        <button class="px-3 py-1.5 text-xs rounded bg-teal-600 text-white hover:bg-teal-700"
                            onclick="MinimumManpowerManager.handleResetScenarioSkillDemandDefault()">
                            恢复总人力默认
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-max border-collapse">
                        <thead>
                            <tr>
                                <th class="border px-2 py-1 text-xs bg-gray-100">职能</th>
                                ${this.SHIFT_KEYS_WITH_NIGHT.map((shift) => `<th class="border px-2 py-1 text-xs bg-gray-100">${this.SHIFT_LABELS[shift]}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${twoCityRowsHtml}
                            <tr>
                                <th class="border px-2 py-1 text-xs text-left font-semibold bg-amber-100">合计</th>
                                ${totalCellsHtml}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-max border-collapse">
                        <thead>
                            <tr>
                                <th class="border px-2 py-1 text-xs bg-gray-100">城市</th>
                                ${this.SHIFT_KEYS.map((shift) => `<th class="border px-2 py-1 text-xs bg-gray-100">${shift}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${cityRatioRowsHtml}
                            <tr>
                                <th class="border px-2 py-1 text-xs text-left font-semibold bg-amber-100">总计</th>
                                ${cityRatioTotalCells}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-max border-collapse">
                        <thead>
                            <tr>
                                <th class="border px-2 py-1 text-xs bg-gray-100">职能</th>
                                ${scenarioColumns.map((col) => `<th class="border px-2 py-1 text-xs bg-gray-100 whitespace-nowrap">${col.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${scenarioRowsHtml}
                            <tr>
                                <th class="border px-2 py-1 text-xs text-left font-semibold bg-amber-100 whitespace-nowrap">总计人力</th>
                                ${scenarioTotalCellsHtml}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="text-xs text-gray-700 space-y-1">
                    <div class="flex flex-wrap gap-1 items-center">
                        <span class="font-semibold">${activeCityName}班别折算参考：</span>${refShiftChips}
                    </div>
                    <div class="flex flex-wrap gap-1 items-center">
                        <span class="font-semibold">${activeCityName}月度职能比例参考：</span>${ratioChips || '<span class="text-gray-500">暂无</span>'}
                    </div>
                </div>
            </div>
        `;
        const archiveRowsHtml = archiveEntries.map((entry) => `
            <tr class="hover:bg-gray-50">
                <td class="px-2 py-1 text-xs border border-gray-200">${this.escapeHtml(entry.month)}</td>
                <td class="px-2 py-1 text-xs border border-gray-200">${this.escapeHtml(entry.cityName)}</td>
                <td class="px-2 py-1 text-xs border border-gray-200">${entry.updatedAt ? this.escapeHtml(new Date(entry.updatedAt).toLocaleString('zh-CN')) : '-'}</td>
                <td class="px-2 py-1 text-xs border border-gray-200">
                    ${entry.isActive
                        ? '<span class="inline-flex px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">当前锁</span>'
                        : '<span class="inline-flex px-2 py-0.5 rounded bg-amber-100 text-amber-700">归档</span>'
                    }
                </td>
                <td class="px-2 py-1 text-xs border border-gray-200">
                    <div class="flex items-center gap-1">
                        <button class="px-2 py-0.5 rounded bg-gray-700 text-white hover:bg-gray-800"
                            onclick="MinimumManpowerManager.viewArchiveSnapshot('${encodeURIComponent(entry.lockKey)}')">查看</button>
                        <button class="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                            onclick="MinimumManpowerManager.downloadArchiveSnapshot('${encodeURIComponent(entry.lockKey)}')">导出</button>
                    </div>
                </td>
            </tr>
        `).join('');
        const archivePanelHtml = `
            <div class="border rounded-lg p-3 bg-white space-y-2">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-gray-800">锁归档快照</h3>
                    <span class="text-xs text-gray-500">共 ${archiveEntries.length} 条</span>
                </div>
                <p class="text-xs text-gray-600">当前锁可编辑，其他锁仅支持查看和导出。</p>
                <div class="overflow-x-auto">
                    <table class="min-w-full border-collapse">
                        <thead>
                            <tr>
                                <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 border border-gray-200">周期</th>
                                <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 border border-gray-200">城市范围</th>
                                <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 border border-gray-200">更新时间</th>
                                <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 border border-gray-200">状态</th>
                                <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 border border-gray-200">操作</th>
                            </tr>
                        </thead>
                        <tbody>${archiveRowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;

        scheduleTable.innerHTML = `
            <div class="p-4 space-y-4">
                <div class="bg-gradient-to-r from-slate-50 to-white border rounded-lg p-4">
                    <div class="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h2 class="text-lg font-semibold text-gray-800">每日最低人力配置</h2>
                            <p class="text-sm text-gray-600 mt-1">周期：${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}</p>
                            <p class="text-xs text-gray-500 mt-1">当前锁：${activeLockMonth} ｜ ${activeCityName}</p>
                            <p class="text-xs text-gray-500 mt-1">说明：仅统计白班（A1/A/A2/B1/B2），大夜配置不在本页面统计。</p>
                        </div>
                        <div class="text-xs text-gray-500">地点：${activeCityName}</div>
                    </div>
                    ${specialLegend}
                </div>

                ${archivePanelHtml}

                ${twoCityPanelHtml}

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    ${renderTemplateEditor(`平日模板（${activeCityName}）`, 'weekday', config.weekdayTemplate, '一键应用到平日', 'weekday', 'bg-blue-50/60 border-blue-200')}
                    ${renderTemplateEditor(`特殊节假日模板（${activeCityName}）`, 'special', config.specialTemplate, '一键应用到特殊日', 'special', 'bg-amber-50/60 border-amber-200')}
                </div>

                <div class="border rounded-lg p-3 ${gapPanelClass}">
                    <div class="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 class="text-sm font-semibold ${gapTitleClass}">白班供需缺口预警</h3>
                            <p class="text-xs text-gray-700 mt-1">${gapHint}</p>
                        </div>
                        <div class="text-xs text-gray-600">
                            人力上限已考虑：大夜/休整与休假阻塞、个人月度白班上限
                            ${gapAnalysis.nightDataReady ? '' : '<span class="ml-2 text-amber-700">（提示：请先完成大夜配置后再确认缺口，当前结果仅供临时参考）</span>'}
                        </div>
                    </div>
                    <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div class="px-3 py-2 bg-white/80 border rounded">当前需求人天：<span class="font-semibold">${gapAnalysis.totalDemand}</span></div>
                        <div class="px-3 py-2 bg-white/80 border rounded">基线供给（应上白班合计）：<span class="font-semibold">${gapAnalysis.baseWhiteCapacity}</span></div>
                        <div class="px-3 py-2 bg-white/80 border rounded">当前方案供给（含n/l）：<span class="font-semibold">${gapAnalysis.maxWhiteCapacity}</span></div>
                    </div>
                    <div class="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-700">
                        <div class="px-2 py-1 bg-white/70 border rounded">基线缺口（用于方程）：<span class="font-semibold ${hasGap ? 'text-red-700' : 'text-emerald-700'}">${equationGap}</span></div>
                        <div class="px-2 py-1 bg-white/70 border rounded">当前容量缺口（含已设n/l）：${gapAnalysis.capacityGap}</div>
                        <div class="px-2 py-1 bg-white/70 border rounded">结构缺口（日需求>日可用）：${gapAnalysis.structuralGapSum}</div>
                    </div>
                    <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                        <div class="px-2 py-1 bg-white/70 border rounded">合班可减缺口潜力：${gapAnalysis.mergePotentialTotal}（预估剩余${gapAnalysis.postMergeGapEstimate}）</div>
                        <div class="px-2 py-1 bg-white/70 border rounded">综合方案约束：<span class="font-semibold">m + n + 2l = ${equationGap}</span></div>
                    </div>
                    <div class="mt-1 text-xs ${hasGap ? 'text-red-700' : 'text-emerald-700'}">${actionHint}</div>
                    <div class="mt-3 border rounded bg-white/80 p-3 space-y-2">
                        <div class="text-xs text-gray-700">
                            缺口补偿参数：m=减少白班需求天数，n=多上1天人数，l=多上2天人数；必须满足 <span class="font-semibold">m+n+2l=${equationGap}</span>
                        </div>
                        <div class="text-xs text-gray-600">
                            上限：A模式 m≤${compositeBounds.maxReduceA}（按合班规则下调）；B模式 m≤${compositeBounds.maxReduceB}（按任意班别下调）；n+l≤${compositeBounds.staffCount}
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <label class="text-xs text-gray-700">
                                减班模式
                                <select id="minimumCompMode" class="mt-1 w-full border rounded px-2 py-1 text-sm">
                                    <option value="A" ${selectedMode === 'A' ? 'selected' : ''}>A（默认，按合班规则）</option>
                                    <option value="B" ${selectedMode === 'B' ? 'selected' : ''}>B（可选，任意班别）</option>
                                </select>
                            </label>
                            <label class="text-xs text-gray-700">
                                m（减少天数）
                                <input id="minimumCompM" type="number" min="0" step="1" class="mt-1 w-full border rounded px-2 py-1 text-sm" value="${initComposite.m}">
                            </label>
                            <label class="text-xs text-gray-700">
                                n（+1人数）
                                <input id="minimumCompN" type="number" min="0" step="1" class="mt-1 w-full border rounded px-2 py-1 text-sm" value="${initComposite.n}">
                            </label>
                            <label class="text-xs text-gray-700">
                                l（+2人数）
                                <input id="minimumCompL" type="number" min="0" step="1" class="mt-1 w-full border rounded px-2 py-1 text-sm" value="${initComposite.l}">
                            </label>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button class="px-3 py-1.5 text-xs rounded bg-amber-600 text-white hover:bg-amber-700"
                                onclick="MinimumManpowerManager.handleAutoSuggestCompositePlan()">
                                自动均衡建议（m/n/l）
                            </button>
                            <button class="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                                onclick="MinimumManpowerManager.handleApplyCompositePlan()">
                                应用综合方案（校验 m+n+2l）
                            </button>
                        </div>
                    </div>
                    <div class="mt-3 space-y-1">
                        ${topDailyGapHtml}
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button class="px-3 py-1.5 text-xs rounded bg-fuchsia-700 text-white hover:bg-fuchsia-800"
                            onclick="MinimumManpowerManager.handleQuickPlanStableA()">
                            一键方案A（最稳）：合班→+1→+2
                        </button>
                        <button class="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700"
                            onclick="MinimumManpowerManager.handleQuickPlanMergeRelief()">
                            仅合班复用（A1-A / A-A2 / B1-B2）
                        </button>
                        <button class="px-3 py-1.5 text-xs rounded bg-teal-600 text-white hover:bg-teal-700"
                            onclick="MinimumManpowerManager.handleQuickPlanSurplusBoost()">
                            一键方案B：人力富余时增补(B2微/A1网/A2网/A星)+1
                        </button>
                        <button class="px-3 py-1.5 text-xs rounded bg-slate-700 text-white hover:bg-slate-800"
                            onclick="MinimumManpowerManager.handleQuickPlanCombined()">
                            一键方案C：先合班减缺再执行富余增补
                        </button>
                        <button class="px-3 py-1.5 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                            onclick="MinimumManpowerManager.handleClearExtraWorkPlan()">
                            清除额外上班方案
                        </button>
                    </div>
                </div>

                <div class="border rounded-lg overflow-hidden">
                    <div class="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">班别人力需求（默认展示，点击格子后微调）</div>
                    <div class="overflow-x-auto">
                        <table class="min-w-max w-full border-collapse">
                            <thead>
                                <tr>
                                    <th class="sticky left-0 z-10 bg-white border px-3 py-2 text-xs font-semibold text-gray-700">班别</th>
                                    ${headerCells}
                                </tr>
                            </thead>
                            <tbody>
                                ${renderDemandRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="border rounded-lg p-3 bg-white">
                    <div class="flex items-center justify-between flex-wrap gap-3">
                        <div class="text-sm text-gray-700">当前总需求人天：<span class="font-semibold text-gray-900" id="minimumManpowerTotalAll">${totals.totalAll}</span></div>
                        <div class="flex items-center gap-2">
                            <button class="px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
                                onclick="MinimumManpowerManager.showTotals()">总计</button>
                            <button class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                onclick="MinimumManpowerManager.saveConfig()">保存配置</button>
                        </div>
                    </div>
                    <div id="minimumManpowerTotalsPanel" class="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 hidden">
                        ${totalShiftHtml}
                    </div>
                </div>
            </div>
        `;

        if (typeof CityUtils !== 'undefined' && CityUtils.applyScopeEditLock) {
            CityUtils.applyScopeEditLock(scheduleTable, activeCityScope);
        }

        if (this.editingCell) {
            this.focusEditingInput(true);
        }
    },

    handleTwoCityTemplateInput(rowKey, shift, rawValue) {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config || typeof config !== 'object') return;
        config.twoCityTemplate = this.normalizeTwoCityTemplate(config.twoCityTemplate);
        if (!config.twoCityTemplate[rowKey]) return;
        if (!this.SHIFT_KEYS_WITH_NIGHT.includes(shift)) return;
        config.twoCityTemplate[rowKey][shift] = this.normalizeTemplateCellString(rawValue, config.twoCityTemplate[rowKey][shift] || '0');
        config.twoCityTemplateSource = 'custom';
        this.refreshTwoCityDerived(config);
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
    },

    handleCityRatioInput(cityKey, shift, rawValue) {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config || typeof config !== 'object') return;
        config.cityRatio = this.normalizeCityRatio(config.cityRatio);
        if (!config.cityRatio[cityKey]) return;
        if (!this.SHIFT_KEYS.includes(shift)) return;
        config.cityRatio[cityKey][shift] = this.normalizePositiveInt(rawValue, config.cityRatio[cityKey][shift] || 0);
        config.twoCityTemplateSource = 'custom';
        this.refreshTwoCityDerived(config);
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
    },

    handleScenarioSkillDemandInput(skillKey, columnKey, rawValue) {
        if (typeof Store === 'undefined') return;
        if (!this.SCENARIO_COLUMNS.includes(columnKey)) return;
        const config = this.getWorkingConfig();
        if (!config || typeof config !== 'object') return;
        config.scenarioSkillDemand = this.normalizeScenarioSkillDemand(config.scenarioSkillDemand);
        if (!config.scenarioSkillDemand[skillKey]) return;
        config.scenarioSkillDemand[skillKey][columnKey] = this.normalizePositiveInt(
            rawValue,
            this.normalizePositiveInt(config.scenarioSkillDemand[skillKey][columnKey], 0)
        );
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
    },

    handleResetScenarioSkillDemandDefault() {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config || typeof config !== 'object') return;
        config.scenarioSkillDemand = this.getDefaultScenarioSkillDemand();
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
        const updateStatusFn = this.getUpdateStatusFn();
        if (updateStatusFn) {
            updateStatusFn('已恢复总人力表默认值', 'success');
        }
    },

    handleApplyShanghaiReferenceToTemplates() {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config || typeof config !== 'object') return;
        this.refreshTwoCityDerived(config);
        if (!config.weekdayTemplate || typeof config.weekdayTemplate !== 'object') {
            config.weekdayTemplate = this.cloneConfig(this.getDefaultTemplates().weekdayTemplate);
        }
        const ref = (config.twoCityDerived && config.twoCityDerived.shanghaiShiftReference)
            ? config.twoCityDerived.shanghaiShiftReference
            : {};
        this.SHIFT_KEYS.forEach((shift) => {
            const v = this.normalizePositiveInt(ref[shift], this.normalizePositiveInt(config.weekdayTemplate?.[shift], 0));
            config.weekdayTemplate[shift] = v;
        });
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
        const updateStatusFn = this.getUpdateStatusFn();
        if (updateStatusFn) {
            updateStatusFn('已按两地比例折算结果应用到平日模板（可继续微调）', 'success');
        }
    },

    handleResetTwoCityTemplateDefault() {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config || typeof config !== 'object') return;
        config.twoCityTemplate = this.getDefaultTwoCityTemplate();
        config.cityRatio = this.getDefaultCityRatio();
        config.twoCityTemplateSource = this.TWO_CITY_DEFAULT_VERSION;
        this.refreshTwoCityDerived(config);
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
        const updateStatusFn = this.getUpdateStatusFn();
        if (updateStatusFn) {
            updateStatusFn('已恢复为示例默认的两地人力安排表', 'success');
        }
    },

    setCellValue(dateStr, shift, rawValue) {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config.dailyDemand || !config.dailyDemand[dateStr]) return;
        const activeScope = this.activeRenderCityScope || this.getActiveCityScope();
        config.dailyDemand[dateStr][shift] = this.mergeScopedShiftValue(
            rawValue,
            config.dailyDemand[dateStr][shift],
            shift,
            activeScope,
            config.cityRatio
        );
        this.persistConfig(config, true);
        this.refreshTotalsOnly(config);
    },

    adjustCell(dateStr, shift, delta) {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config.dailyDemand || !config.dailyDemand[dateStr]) return;
        const activeScope = this.activeRenderCityScope || this.getActiveCityScope();
        const currentScoped = this.projectScopedShiftValue(
            config.dailyDemand[dateStr][shift],
            shift,
            activeScope,
            config.cityRatio
        );
        const nextScoped = Math.max(0, currentScoped + delta);
        config.dailyDemand[dateStr][shift] = this.mergeScopedShiftValue(
            nextScoped,
            config.dailyDemand[dateStr][shift],
            shift,
            activeScope,
            config.cityRatio
        );
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
    },

    openCellEditor(dateStr, shift) {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        const activeScope = this.activeRenderCityScope || this.getActiveCityScope();
        const currentVal = this.projectScopedShiftValue(
            config?.dailyDemand?.[dateStr]?.[shift],
            shift,
            activeScope,
            config.cityRatio
        );
        this.editingCell = { dateStr, shift };
        this.editingTempValue = currentVal;
        this.showMinimumManpowerConfig();
    },

    cancelEditing() {
        this.editingCell = null;
        this.editingTempValue = 0;
        this.showMinimumManpowerConfig();
    },

    setEditingValue(rawValue) {
        if (rawValue === '' || rawValue === null || rawValue === undefined) {
            this.editingTempValue = 0;
        } else {
            this.editingTempValue = this.normalizePositiveInt(rawValue, this.editingTempValue);
        }
        const input = document.getElementById(this.EDITING_INPUT_ID);
        if (input && document.activeElement !== input) input.value = this.editingTempValue;
    },

    adjustEditingValue(delta) {
        this.editingTempValue = Math.max(0, this.normalizePositiveInt(this.editingTempValue, 0) + delta);
        const input = document.getElementById(this.EDITING_INPUT_ID);
        if (input) input.value = this.editingTempValue;
        this.focusEditingInput();
    },

    preventEditingBlur(event) {
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
    },

    focusEditingInput(selectAll = false) {
        setTimeout(() => {
            const input = document.getElementById(this.EDITING_INPUT_ID);
            if (!input) return;
            input.focus();
            if (selectAll && typeof input.select === 'function') {
                input.select();
            }
        }, 0);
    },

    applyEditingValue() {
        if (!this.editingCell || typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        const { dateStr, shift } = this.editingCell;
        if (!config.dailyDemand || !config.dailyDemand[dateStr]) return;
        const activeScope = this.activeRenderCityScope || this.getActiveCityScope();
        config.dailyDemand[dateStr][shift] = this.mergeScopedShiftValue(
            this.editingTempValue,
            config.dailyDemand[dateStr][shift],
            shift,
            activeScope,
            config.cityRatio
        );
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
    },

    refreshTotalsOnly(config) {
        const scheduleConfig = (typeof Store !== 'undefined' ? Store.getState('scheduleConfig') : null) || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;
        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const activeScope = this.activeRenderCityScope || this.getActiveCityScope();
        const totals = this.computeTotals(config, dateList, activeScope);
        const totalEl = document.getElementById('minimumManpowerTotalAll');
        if (totalEl) {
            totalEl.textContent = totals.totalAll;
        }
    },

    buildReliefDateOrder(dateList, analysis) {
        const gapMap = {};
        (analysis.dailyGapRows || []).forEach((r) => {
            gapMap[r.dateStr] = this.normalizePositiveInt(r.gap, 0);
        });
        return dateList.slice().sort((a, b) => {
            const ga = gapMap[a.dateStr] || 0;
            const gb = gapMap[b.dateStr] || 0;
            if (gb !== ga) return gb - ga;
            return String(a.dateStr).localeCompare(String(b.dateStr));
        });
    },

    buildExtraWorkPriority(dateList) {
        const staffList = (typeof Store !== 'undefined' && typeof Store.getCurrentStaffData === 'function')
            ? (Store.getCurrentStaffData() || [])
            : [];
        const requests = this.getEffectivePersonalRequests();
        const dateSet = new Set((dateList || []).map((d) => d.dateStr));
        const extraRequestTypes = new Set(['ANNUAL', 'LEGAL', 'REQ', 'SICK']);

        const rows = staffList.map((staff) => {
            const sid = String(staff.staffId || staff.id || '').trim();
            const name = staff.staffName || staff.name || sid;
            const score = Number(staff.score);
            const reqMap = requests[sid] || {};
            let usedExtraRequestDays = 0;
            Object.keys(reqMap).forEach((ds) => {
                if (!dateSet.has(ds)) return;
                if (extraRequestTypes.has(reqMap[ds])) {
                    usedExtraRequestDays += 1;
                }
            });
            return {
                sid,
                name,
                usedExtraRequestDays,
                score: Number.isFinite(score) ? score : 0
            };
        }).filter((r) => !!r.sid);

        rows.sort((a, b) => {
            if (b.usedExtraRequestDays !== a.usedExtraRequestDays) {
                return b.usedExtraRequestDays - a.usedExtraRequestDays;
            }
            if (b.score !== a.score) return b.score - a.score;
            return String(a.sid).localeCompare(String(b.sid), undefined, { numeric: true });
        });

        return rows;
    },

    findReductionSlot(row, reductionMode) {
        if (!row || typeof row !== 'object') return null;
        const mode = reductionMode === 'B' ? 'B' : 'A';

        if (mode === 'A') {
            for (let i = 0; i < this.MERGE_RULES.length; i++) {
                const rule = this.MERGE_RULES[i];
                const a = this.normalizePositiveInt(row[rule.primary], 0);
                const b = this.normalizePositiveInt(row[rule.secondary], 0);
                const reduceShift = rule.reduceShift || rule.secondary;
                const reduceVal = this.normalizePositiveInt(row[reduceShift], 0);
                if (a > 0 && b > 0 && reduceVal > 0) {
                    return {
                        shift: reduceShift,
                        ruleId: rule.id,
                        label: rule.label
                    };
                }
            }
            return null;
        }

        let bestShift = null;
        let bestVal = 0;
        this.SHIFT_KEYS.forEach((shift) => {
            const v = this.normalizePositiveInt(row[shift], 0);
            if (v > bestVal) {
                bestVal = v;
                bestShift = shift;
            }
        });
        if (!bestShift || bestVal <= 0) return null;
        return {
            shift: bestShift,
            ruleId: 'FREE',
            label: `通用下调(${bestShift})`
        };
    },

    pickReductionCandidateDate(
        config,
        dateList,
        reductionMode,
        reducedByDate,
        specialDateSet,
        pickSpecialOnly = false,
        options = {}
    ) {
        const capPerDate = Math.max(1, this.normalizePositiveInt(options.capPerDate, 2));
        const reducedByWeek = (options.reducedByWeek && typeof options.reducedByWeek === 'object') ? options.reducedByWeek : {};
        const dateIndexMap = (options.dateIndexMap && typeof options.dateIndexMap === 'object') ? options.dateIndexMap : {};
        const lastPickedIdx = Number.isFinite(Number(options.lastPickedIdx)) ? Number(options.lastPickedIdx) : null;
        const centerIdx = (dateList.length - 1) / 2;

        const candidates = dateList
            .map((d) => d.dateStr)
            .filter((ds) => {
                if (!config.dailyDemand || !config.dailyDemand[ds]) return false;
                const isSpecial = specialDateSet.has(ds);
                if (!pickSpecialOnly && isSpecial) return false;
                if (pickSpecialOnly && !isSpecial) return false;
                if (this.normalizePositiveInt(reducedByDate[ds], 0) >= capPerDate) return false;
                return !!this.findReductionSlot(config.dailyDemand[ds], reductionMode);
            });
        if (candidates.length === 0) return null;

        candidates.sort((a, b) => {
            const idxA = Number.isFinite(Number(dateIndexMap[a])) ? Number(dateIndexMap[a]) : 0;
            const idxB = Number.isFinite(Number(dateIndexMap[b])) ? Number(dateIndexMap[b]) : 0;
            const weekA = Math.floor(idxA / 7);
            const weekB = Math.floor(idxB / 7);
            const weekUseA = this.normalizePositiveInt(reducedByWeek[weekA], 0);
            const weekUseB = this.normalizePositiveInt(reducedByWeek[weekB], 0);

            const dateUseA = this.normalizePositiveInt(reducedByDate[a], 0);
            const dateUseB = this.normalizePositiveInt(reducedByDate[b], 0);

            const prevA = idxA > 0 ? dateList[idxA - 1].dateStr : null;
            const nextA = idxA < dateList.length - 1 ? dateList[idxA + 1].dateStr : null;
            const prevB = idxB > 0 ? dateList[idxB - 1].dateStr : null;
            const nextB = idxB < dateList.length - 1 ? dateList[idxB + 1].dateStr : null;
            const neighborUseA = this.normalizePositiveInt(prevA ? reducedByDate[prevA] : 0, 0) + this.normalizePositiveInt(nextA ? reducedByDate[nextA] : 0, 0);
            const neighborUseB = this.normalizePositiveInt(prevB ? reducedByDate[prevB] : 0, 0) + this.normalizePositiveInt(nextB ? reducedByDate[nextB] : 0, 0);

            const rowA = config.dailyDemand[a] || {};
            const rowB = config.dailyDemand[b] || {};
            const demandA = this.SHIFT_KEYS.reduce((sum, shift) => sum + this.normalizePositiveInt(rowA[shift], 0), 0);
            const demandB = this.SHIFT_KEYS.reduce((sum, shift) => sum + this.normalizePositiveInt(rowB[shift], 0), 0);

            let continuityAdjA = 0;
            let continuityAdjB = 0;
            if (lastPickedIdx != null) {
                const diffA = Math.abs(idxA - lastPickedIdx);
                const diffB = Math.abs(idxB - lastPickedIdx);
                // 允许“稍微连续”：与上次相邻/隔1天有轻微优先
                continuityAdjA = diffA === 1 ? -0.6 : (diffA === 2 ? -0.3 : 0);
                continuityAdjB = diffB === 1 ? -0.6 : (diffB === 2 ? -0.3 : 0);
            }

            const scoreA =
                dateUseA * 20 +
                weekUseA * 5 +
                neighborUseA * 4 +
                Math.abs(idxA - centerIdx) * 0.15 +
                continuityAdjA -
                demandA * 0.03;
            const scoreB =
                dateUseB * 20 +
                weekUseB * 5 +
                neighborUseB * 4 +
                Math.abs(idxB - centerIdx) * 0.15 +
                continuityAdjB -
                demandB * 0.03;

            if (scoreA !== scoreB) return scoreA - scoreB;
            return String(a).localeCompare(String(b));
        });

        return candidates[0];
    },

    applyDemandReduction(config, dateList, targetDays, reductionMode = 'A') {
        const target = this.normalizePositiveInt(targetDays, 0);
        if (!config || !config.dailyDemand || target <= 0) {
            return { applied: 0, remaining: target, details: [], specialReducedCount: 0 };
        }

        const mode = reductionMode === 'B' ? 'B' : 'A';
        const scheduleConfig = (typeof Store !== 'undefined') ? (Store.getState('scheduleConfig') || {}) : {};
        const specialDateSet = this.getSpecialDateSet(dateList, scheduleConfig);
        const details = [];
        const reducedByDate = {};
        const reducedByWeek = {};
        const dateIndexMap = {};
        dateList.forEach((d, idx) => { dateIndexMap[d.dateStr] = idx; });
        const reducibleNormalDays = dateList
            .map((d) => d.dateStr)
            .filter((ds) => !specialDateSet.has(ds))
            .filter((ds) => !!this.findReductionSlot(config.dailyDemand[ds] || {}, mode)).length;
        let capPerDate = Math.min(
            3,
            Math.max(1, Math.ceil(target / Math.max(1, reducibleNormalDays)) + 1)
        );
        let remaining = target;
        let safety = 0;
        const maxLoops = Math.max(1000, target * 30);
        let lastPickedIdx = null;

        while (remaining > 0 && safety < maxLoops) {
            safety += 1;
            const normalPick = this.pickReductionCandidateDate(
                config,
                dateList,
                mode,
                reducedByDate,
                specialDateSet,
                false,
                { capPerDate, reducedByWeek, dateIndexMap, lastPickedIdx }
            );
            const specialPick = normalPick ? null : this.pickReductionCandidateDate(
                config,
                dateList,
                mode,
                reducedByDate,
                specialDateSet,
                true,
                { capPerDate, reducedByWeek, dateIndexMap, lastPickedIdx }
            );
            const dateStr = normalPick || specialPick;
            if (!dateStr) {
                // 在严格分散限制下无可选日期时，逐步放宽单日上限，保证方案可落地
                if (capPerDate < 6) {
                    capPerDate += 1;
                    continue;
                }
                break;
            }

            const row = config.dailyDemand[dateStr] || {};
            const slot = this.findReductionSlot(row, mode);
            if (!slot || !slot.shift) break;

            const current = this.normalizePositiveInt(row[slot.shift], 0);
            if (current <= 0) continue;

            row[slot.shift] = Math.max(0, current - 1);
            reducedByDate[dateStr] = this.normalizePositiveInt(reducedByDate[dateStr], 0) + 1;
            const idx = Number.isFinite(Number(dateIndexMap[dateStr])) ? Number(dateIndexMap[dateStr]) : null;
            if (idx != null) {
                const weekIdx = Math.floor(idx / 7);
                reducedByWeek[weekIdx] = this.normalizePositiveInt(reducedByWeek[weekIdx], 0) + 1;
                lastPickedIdx = idx;
            }
            details.push({
                dateStr,
                shift: slot.shift,
                mode,
                ruleId: slot.ruleId,
                label: slot.label,
                isSpecial: specialDateSet.has(dateStr)
            });
            remaining -= 1;
        }

        return {
            applied: target - remaining,
            remaining,
            details,
            specialReducedCount: details.filter((d) => d.isSpecial).length
        };
    },

    estimateReducibleDays(config, dateList, reductionMode = 'A') {
        if (!config || !config.dailyDemand) return 0;
        const sim = this.cloneConfig(config);
        const upper = this.computeTotals(sim, dateList).totalAll;
        if (upper <= 0) return 0;
        const result = this.applyDemandReduction(sim, dateList, upper, reductionMode);
        return this.normalizePositiveInt(result.applied, 0);
    },

    buildCompositeBounds(config, dateList, gapAnalysis) {
        const staffCount = this.normalizePositiveInt(gapAnalysis.staffCount, 0);
        const maxReduceA = this.estimateReducibleDays(config, dateList, 'A');
        const maxReduceB = this.estimateReducibleDays(config, dateList, 'B');
        return {
            gap: this.normalizePositiveInt(gapAnalysis.equationGap, 0),
            staffCount,
            maxReduceA,
            maxReduceB,
            maxExtraDays: staffCount * 2
        };
    },

    suggestCompositePlan(gap, maxReduceM, staffCount) {
        const targetGap = this.normalizePositiveInt(gap, 0);
        const maxM = Math.max(0, this.normalizePositiveInt(maxReduceM, 0));
        const staffCap = Math.max(0, this.normalizePositiveInt(staffCount, 0));
        if (targetGap <= 0) {
            return { m: 0, n: 0, l: 0 };
        }

        let best = null;
        const mUpper = Math.min(maxM, targetGap);
        for (let m = 0; m <= mUpper; m++) {
            const rem = targetGap - m;
            const lUpper = Math.min(staffCap, Math.floor(rem / 2));
            for (let l = 0; l <= lUpper; l++) {
                const n = rem - 2 * l;
                if (n < 0) continue;
                if (n + l > staffCap) continue;

                const dayM = m;
                const dayN = n;
                const dayL = 2 * l;
                const mean = targetGap / 3;
                const zeroPenalty =
                    (dayM === 0 ? 1 : 0) +
                    (dayN === 0 ? 1 : 0) +
                    (dayL === 0 ? 1 : 0);
                const balancePenalty =
                    Math.abs(dayM - mean) +
                    Math.abs(dayN - mean) +
                    Math.abs(dayL - mean);
                const score = zeroPenalty * 1000 + balancePenalty;
                if (!best || score < best.score) {
                    best = { m, n, l, score };
                }
            }
        }

        if (!best) {
            return { m: Math.min(targetGap, mUpper), n: 0, l: 0 };
        }
        return { m: best.m, n: best.n, l: best.l };
    },

    readCompositeInputs() {
        const modeEl = document.getElementById('minimumCompMode');
        const mEl = document.getElementById('minimumCompM');
        const nEl = document.getElementById('minimumCompN');
        const lEl = document.getElementById('minimumCompL');

        return {
            reductionMode: (modeEl && modeEl.value === 'B') ? 'B' : 'A',
            m: this.normalizePositiveInt(mEl ? mEl.value : 0, 0),
            n: this.normalizePositiveInt(nEl ? nEl.value : 0, 0),
            l: this.normalizePositiveInt(lEl ? lEl.value : 0, 0)
        };
    },

    handleAutoSuggestCompositePlan() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;

        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const rawConfig = this.getWorkingConfig();
        if (!rawConfig || !rawConfig.dailyDemand) return;
        const baselineConfig = this.buildCompositeBaselineConfig(rawConfig);
        const analysis = this.buildManpowerGapAnalysis(baselineConfig, dateList);
        const updateStatusFn = this.getUpdateStatusFn();
        if (!analysis.nightDataReady) {
            if (updateStatusFn) updateStatusFn('请先完成“大夜管理和配置”后再生成 m/n/l 建议', 'warning');
            return;
        }
        const bounds = this.buildCompositeBounds(baselineConfig, dateList, analysis);
        const input = this.readCompositeInputs();
        const maxM = input.reductionMode === 'B' ? bounds.maxReduceB : bounds.maxReduceA;
        const suggest = this.suggestCompositePlan(bounds.gap, maxM, bounds.staffCount);

        const mEl = document.getElementById('minimumCompM');
        const nEl = document.getElementById('minimumCompN');
        const lEl = document.getElementById('minimumCompL');
        if (mEl) mEl.value = suggest.m;
        if (nEl) nEl.value = suggest.n;
        if (lEl) lEl.value = suggest.l;

        if (updateStatusFn) {
            updateStatusFn(
                `已按${input.reductionMode}模式生成建议：m=${suggest.m}, n=${suggest.n}, l=${suggest.l}（满足 m+n+2l=${bounds.gap}）`,
                'info'
            );
        }
    },

    handleApplyCompositePlan() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;

        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const rawConfig = this.getWorkingConfig();
        if (!rawConfig || !rawConfig.dailyDemand) return;
        const config = this.buildCompositeBaselineConfig(rawConfig);
        const baseDemandSnapshot = this.cloneConfig(config.dailyDemand || {});

        const updateStatusFn = this.getUpdateStatusFn();
        const before = this.buildManpowerGapAnalysis(config, dateList);
        if (!before.nightDataReady) {
            if (updateStatusFn) updateStatusFn('请先完成“大夜管理和配置”后再应用综合补缺方案', 'warning');
            return;
        }
        const bounds = this.buildCompositeBounds(config, dateList, before);
        const gap = this.normalizePositiveInt(bounds.gap, 0);
        if (gap <= 0) {
            if (updateStatusFn) updateStatusFn('当前缺口为0，无需应用综合补缺方案', 'info');
            return;
        }

        const { reductionMode, m, n, l } = this.readCompositeInputs();
        const formulaValue = m + n + 2 * l;
        if (formulaValue !== gap) {
            if (updateStatusFn) updateStatusFn(`参数校验失败：需满足 m+n+2l=${gap}，当前为 ${formulaValue}`, 'warning');
            return;
        }

        const maxM = reductionMode === 'B' ? bounds.maxReduceB : bounds.maxReduceA;
        if (m > maxM) {
            if (updateStatusFn) updateStatusFn(`参数校验失败：模式${reductionMode}下 m 最大可取 ${maxM}`, 'warning');
            return;
        }
        if (n + l > bounds.staffCount) {
            if (updateStatusFn) updateStatusFn(`参数校验失败：n+l 不能超过员工数 ${bounds.staffCount}`, 'warning');
            return;
        }

        const priority = this.buildExtraWorkPriority(dateList);
        if (priority.length < n + l) {
            if (updateStatusFn) updateStatusFn(`可分配员工不足：需要 ${n + l} 人，当前可分配 ${priority.length} 人`, 'warning');
            return;
        }

        this.clearExtraWorkPlan(config);
        const reduceResult = this.applyDemandReduction(config, dateList, m, reductionMode);
        if (reduceResult.applied < m) {
            if (updateStatusFn) {
                updateStatusFn(
                    `下调白班需求失败：只执行了 ${reduceResult.applied}/${m} 天，请调整 m 或切换模式`,
                    'warning'
                );
            }
            return;
        }

        const plusTwoRows = priority.slice(0, l);
        const plusOneRows = priority.slice(l, l + n);
        const staffExtraDays = {};
        plusTwoRows.forEach((r) => {
            staffExtraDays[r.sid] = 2;
        });
        plusOneRows.forEach((r) => {
            if (!staffExtraDays[r.sid]) {
                staffExtraDays[r.sid] = 1;
            }
        });

        if (n + l > 0) {
            this.setExtraWorkPlan(config, {
                enabled: true,
                mode: 'manualMnl',
                staffExtraDays,
                stage: 'manualComposite'
            });
        } else {
            this.clearExtraWorkPlan(config);
        }
        this.setCompensationPlan(config, {
            enabled: true,
            reductionMode,
            targetGap: gap,
            m,
            n,
            l,
            details: {
                baseDailyDemand: baseDemandSnapshot,
                reducedDays: reduceResult.applied,
                reducedOnSpecialDays: reduceResult.specialReducedCount,
                plusOneStaffIds: plusOneRows.map((r) => r.sid),
                plusTwoStaffIds: plusTwoRows.map((r) => r.sid)
            }
        });

        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();

        const after = this.buildManpowerGapAnalysis(config, dateList);
        if (updateStatusFn) {
            updateStatusFn(
                `综合补缺已应用：m=${m}, n=${n}, l=${l}（${reductionMode}模式），当前容量缺口 ${before.capacityGap} -> ${after.capacityGap}`,
                after.capacityGap > 0 ? 'warning' : 'success'
            );
        }
    },

    applyExtraWorkPlusOne(config, dateList) {
        const plan = this.getExtraWorkPlan(config);
        const priority = this.buildExtraWorkPriority(dateList);
        const analysis = this.buildManpowerGapAnalysis(config, dateList);
        const need = Math.max(0, this.normalizePositiveInt(analysis.lowerBoundGap, 0));
        if (need <= 0) {
            return { applied: 0, targetNeed: 0, staffTouched: [] };
        }

        const next = { ...plan, enabled: true, mode: 'staffSpecific', staffExtraDays: { ...plan.staffExtraDays }, stage: 'plus1' };
        let remaining = need;
        const touched = [];

        priority.forEach((r) => {
            if (remaining <= 0) return;
            const cur = this.normalizePositiveInt(next.staffExtraDays[r.sid], 0);
            if (cur >= 1) return;
            next.staffExtraDays[r.sid] = 1;
            touched.push(r.sid);
            remaining -= 1;
        });

        this.setExtraWorkPlan(config, next);
        return {
            applied: touched.length,
            targetNeed: need,
            staffTouched: touched
        };
    },

    applyExtraWorkPlusTwo(config, dateList) {
        const priority = this.buildExtraWorkPriority(dateList);
        if (priority.length === 0) {
            return { appliedStage1: 0, appliedStage2: 0, allPlusOne: false, staffTouched: [] };
        }

        const basePlan = this.getExtraWorkPlan(config);
        const next = {
            ...basePlan,
            enabled: true,
            mode: 'staffSpecific',
            staffExtraDays: { ...basePlan.staffExtraDays },
            stage: 'plus2'
        };

        let appliedStage1 = 0;
        priority.forEach((r) => {
            const cur = this.normalizePositiveInt(next.staffExtraDays[r.sid], 0);
            if (cur < 1) {
                next.staffExtraDays[r.sid] = 1;
                appliedStage1 += 1;
            }
        });

        this.setExtraWorkPlan(config, next);
        const analysisAfterStage1 = this.buildManpowerGapAnalysis(config, dateList);
        let needStage2 = Math.max(0, this.normalizePositiveInt(analysisAfterStage1.lowerBoundGap, 0));
        let appliedStage2 = 0;
        const touched = [];

        priority.forEach((r) => {
            if (needStage2 <= 0) return;
            const cur = this.normalizePositiveInt(next.staffExtraDays[r.sid], 0);
            if (cur >= 2) return;
            next.staffExtraDays[r.sid] = 2;
            appliedStage2 += 1;
            touched.push(r.sid);
            needStage2 -= 1;
        });

        this.setExtraWorkPlan(config, next);
        return {
            appliedStage1,
            appliedStage2,
            allPlusOne: true,
            staffTouched: touched
        };
    },

    applyMergeReliefPlan(config, dateList, analysis) {
        const needRelief = Math.max(
            this.normalizePositiveInt(analysis.lowerBoundGap, 0),
            this.normalizePositiveInt(analysis.capacityGap, 0)
        );
        if (needRelief <= 0) {
            return { applied: 0, details: [], remaining: 0 };
        }

        let remaining = needRelief;
        const details = [];
        const orderedDates = this.buildReliefDateOrder(dateList, analysis);

        orderedDates.forEach((item) => {
            if (remaining <= 0) return;
            const ds = item.dateStr;
            if (!config.dailyDemand[ds]) return;
            const row = config.dailyDemand[ds];

            this.MERGE_RULES.forEach((rule) => {
                if (remaining <= 0) return;
                const a = this.normalizePositiveInt(row[rule.primary], 0);
                const b = this.normalizePositiveInt(row[rule.secondary], 0);
                const reduceShift = rule.reduceShift || rule.secondary;
                const reduceVal = this.normalizePositiveInt(row[reduceShift], 0);
                if (a <= 0 || b <= 0 || reduceVal <= 0) return;

                row[reduceShift] = Math.max(0, reduceVal - 1);
                remaining -= 1;
                details.push({
                    dateStr: ds,
                    ruleId: rule.id,
                    label: rule.label,
                    reducedShift: reduceShift
                });
            });
        });

        return {
            applied: details.length,
            details,
            remaining: Math.max(0, remaining)
        };
    },

    async handleQuickPlanStableA() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;

        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const config = this.getWorkingConfig();
        if (!config || !config.dailyDemand) return;
        if (this.restoreDemandFromCompensationBase(config)) {
            this.clearCompensationPlan(config);
        }

        const updateStatusFn = this.getUpdateStatusFn();
        const before = this.buildManpowerGapAnalysis(config, dateList);
        const steps = [];
        let configChanged = false;
        let current = before;

        if (current.lowerBoundGap > 0) {
            const merge = this.applyMergeReliefPlan(config, dateList, current);
            if (merge.applied > 0) {
                configChanged = true;
                steps.push(`合班复用 ${merge.applied} 次`);
                current = this.buildManpowerGapAnalysis(config, dateList);
            }
        }

        if (current.lowerBoundGap > 0) {
            const plus1 = this.applyExtraWorkPlusOne(config, dateList);
            if (plus1.applied > 0) {
                configChanged = true;
                steps.push(`额外上班 +1 共 ${plus1.applied} 人`);
                current = this.buildManpowerGapAnalysis(config, dateList);
            }
        }

        if (current.lowerBoundGap > 0) {
            const plus2 = this.applyExtraWorkPlusTwo(config, dateList);
            const plus2Changed = plus2.appliedStage1 + plus2.appliedStage2;
            if (plus2Changed > 0) {
                configChanged = true;
                steps.push(`先补齐全员+1(${plus2.appliedStage1}人)，再+2(${plus2.appliedStage2}人)`);
                current = this.buildManpowerGapAnalysis(config, dateList);
            }
        }

        if (configChanged) {
            this.clearCompensationPlan(config);
            this.persistConfig(config, true);
        }

        let surplusBoost = null;
        if (current.surplusByCapacity > 0) {
            surplusBoost = await this.applySurplusBoostToDailyManpowerConfig();
            if (surplusBoost && surplusBoost.changed > 0) {
                steps.push(`富余增补 ${surplusBoost.labels.join('、')} 各+1`);
            }
        }

        this.showMinimumManpowerConfig();
        const after = configChanged ? this.buildManpowerGapAnalysis(config, dateList) : before;

        if (steps.length === 0) {
            if (updateStatusFn) {
                updateStatusFn(
                    before.lowerBoundGap > 0
                        ? '方案A未生效：当前缺口无法通过合班或额外上班快速收敛，请人工下调最低人力或补充人力'
                        : '当前无缺口，且无可执行的富余增补',
                    before.lowerBoundGap > 0 ? 'warning' : 'info'
                );
            }
            return;
        }

        if (updateStatusFn) {
            const summary = `方案A已执行：${steps.join('；')}。缺口下界 ${before.lowerBoundGap} -> ${after.lowerBoundGap}`;
            updateStatusFn(summary, after.lowerBoundGap > 0 ? 'warning' : 'success');
        }
    },

    handleQuickPlanMergeRelief() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;

        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const config = this.getWorkingConfig();
        if (!config || !config.dailyDemand) return;
        if (this.restoreDemandFromCompensationBase(config)) {
            this.clearCompensationPlan(config);
        }

        const before = this.buildManpowerGapAnalysis(config, dateList);
        const updateStatusFn = this.getUpdateStatusFn();
        if (before.lowerBoundGap <= 0) {
            if (updateStatusFn) updateStatusFn('当前供需无缺口，无需执行合班减缺方案', 'info');
            return;
        }

        const result = this.applyMergeReliefPlan(config, dateList, before);
        if (result.applied <= 0) {
            if (updateStatusFn) updateStatusFn('合班方案未能应用（当前班次组合无可复用空间）', 'warning');
            return;
        }

        this.clearCompensationPlan(config);
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();

        const after = this.buildManpowerGapAnalysis(config, dateList);
        if (updateStatusFn) {
            updateStatusFn(
                `合班方案已应用：${result.applied} 次，缺口下界 ${before.lowerBoundGap} -> ${after.lowerBoundGap}`,
                after.lowerBoundGap > 0 ? 'warning' : 'success'
            );
        }
    },

    handleQuickPlanExtraPlusOne() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;
        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const config = this.getWorkingConfig();
        if (!config || !config.dailyDemand) return;
        if (this.restoreDemandFromCompensationBase(config)) {
            this.clearCompensationPlan(config);
        }

        const updateStatusFn = this.getUpdateStatusFn();
        const before = this.buildManpowerGapAnalysis(config, dateList);
        const result = this.applyExtraWorkPlusOne(config, dateList);
        if (result.applied <= 0) {
            if (updateStatusFn) updateStatusFn('多上1天方案未触发（当前缺口为0或无可分配人员）', 'info');
            return;
        }

        this.clearCompensationPlan(config);
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
        const after = this.buildManpowerGapAnalysis(config, dateList);
        if (updateStatusFn) {
            updateStatusFn(
                `已安排 ${result.applied} 人多上1天，缺口下界 ${before.lowerBoundGap} -> ${after.lowerBoundGap}`,
                after.lowerBoundGap > 0 ? 'warning' : 'success'
            );
        }
    },

    handleQuickPlanExtraPlusTwo() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;
        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const config = this.getWorkingConfig();
        if (!config || !config.dailyDemand) return;
        if (this.restoreDemandFromCompensationBase(config)) {
            this.clearCompensationPlan(config);
        }

        const updateStatusFn = this.getUpdateStatusFn();
        const before = this.buildManpowerGapAnalysis(config, dateList);
        const result = this.applyExtraWorkPlusTwo(config, dateList);
        const changed = result.appliedStage1 + result.appliedStage2;
        if (changed <= 0) {
            if (updateStatusFn) updateStatusFn('多上2天方案未触发（无可分配人员）', 'info');
            return;
        }

        this.clearCompensationPlan(config);
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();
        const after = this.buildManpowerGapAnalysis(config, dateList);
        if (updateStatusFn) {
            updateStatusFn(
                `多上2天方案已执行：先补齐全员+1(${result.appliedStage1}人)，再安排+2(${result.appliedStage2}人)，缺口下界 ${before.lowerBoundGap} -> ${after.lowerBoundGap}`,
                after.lowerBoundGap > 0 ? 'warning' : 'success'
            );
        }
    },

    handleClearExtraWorkPlan() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;
        const config = this.getWorkingConfig();
        if (!config || !config.dailyDemand) return;

        const restored = this.restoreDemandFromCompensationBase(config);
        this.clearExtraWorkPlan(config);
        this.clearCompensationPlan(config);
        this.persistConfig(config, true);
        this.showMinimumManpowerConfig();

        const updateStatusFn = this.getUpdateStatusFn();
        if (updateStatusFn) {
            updateStatusFn(
                restored
                    ? '已清除额外上班与综合补缺方案，并恢复到应用前的最低人力需求'
                    : '已清除额外上班与综合补缺方案',
                'info'
            );
        }
    },

    async applySurplusBoostToDailyManpowerConfig() {
        const labels = [];
        const applyToMatrix = (matrix) => {
            if (!matrix || typeof matrix !== 'object') return 0;
            let changed = 0;
            this.SURPLUS_BOOST_TARGETS.forEach((target) => {
                const cell = matrix[target.key];
                if (!cell) return;
                const maxVal = Number(cell.max);
                if (!Number.isFinite(maxVal)) return;
                const minVal = Number.isFinite(Number(cell.min)) ? Number(cell.min) : 0;
                cell.max = Math.max(minVal, Math.floor(maxVal) + 1);
                labels.push(target.label);
                changed += 1;
            });
            return changed;
        };

        let activeConfig = null;
        const activeConfigId = (typeof Store !== 'undefined')
            ? Store.getState('activeDailyManpowerConfigId')
            : null;
        if (activeConfigId && typeof DB !== 'undefined' && typeof DB.loadDailyManpowerConfig === 'function') {
            try {
                activeConfig = await DB.loadDailyManpowerConfig(activeConfigId);
            } catch (error) {
                console.warn('[MinimumManpowerManager] 读取每日人力配置失败:', error);
            }
        }

        let matrixRef = null;
        if (typeof DailyManpowerManager !== 'undefined'
            && DailyManpowerManager.matrix
            && typeof DailyManpowerManager.matrix === 'object'
            && Object.keys(DailyManpowerManager.matrix).length > 0) {
            matrixRef = DailyManpowerManager.matrix;
        } else if (activeConfig && activeConfig.matrix) {
            matrixRef = activeConfig.matrix;
        }

        if (!matrixRef) {
            return { changed: 0, labels: [] };
        }

        const changed = applyToMatrix(matrixRef);
        if (changed <= 0) {
            return { changed: 0, labels: [] };
        }

        // 同步到运行态矩阵
        if (typeof DailyManpowerManager !== 'undefined'
            && DailyManpowerManager.matrix
            && DailyManpowerManager.matrix !== matrixRef) {
            this.SURPLUS_BOOST_TARGETS.forEach((target) => {
                if (matrixRef[target.key]) {
                    DailyManpowerManager.matrix[target.key] = JSON.parse(JSON.stringify(matrixRef[target.key]));
                }
            });
        }

        // 持久化到激活的每日人力配置
        if (activeConfig && activeConfig.matrix && typeof DB !== 'undefined' && typeof DB.saveDailyManpowerConfig === 'function') {
            const permission = this.checkMutationPermission({
                silent: false,
                cityScope: this.normalizeCityScope(activeConfig.cityScope || this.getActiveCityScope())
            });
            if (!permission.allowed) {
                return { changed: 0, labels: [] };
            }
            const beforeConfig = JSON.parse(JSON.stringify(activeConfig));
            this.SURPLUS_BOOST_TARGETS.forEach((target) => {
                if (matrixRef[target.key]) {
                    activeConfig.matrix[target.key] = JSON.parse(JSON.stringify(matrixRef[target.key]));
                }
            });
            activeConfig.updatedAt = new Date().toISOString();
            try {
                await DB.saveDailyManpowerConfig(activeConfig);
                if (typeof Store !== 'undefined' && Store && typeof Store.appendAuditLog === 'function') {
                    const lockKey = (typeof Store.buildLockKey === 'function')
                        ? Store.buildLockKey(activeConfig.schedulePeriodConfigId || null, this.normalizeCityScope(activeConfig.cityScope || this.getActiveCityScope()))
                        : null;
                    Store.appendAuditLog({
                        action: 'SURPLUS_BOOST_DAILY_MANPOWER',
                        entityType: 'dailyManpower',
                        entityId: activeConfig.configId || null,
                        cityScope: activeConfig.cityScope || this.getActiveCityScope(),
                        lockKey,
                        before: beforeConfig,
                        after: activeConfig
                    });
                }
            } catch (error) {
                console.warn('[MinimumManpowerManager] 保存每日人力配置失败:', error);
            }
        }

        return { changed, labels: Array.from(new Set(labels)) };
    },

    async handleQuickPlanSurplusBoost() {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;
        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const config = this.getWorkingConfig();
        const analysis = this.buildManpowerGapAnalysis(config, dateList);
        const updateStatusFn = this.getUpdateStatusFn();

        if (analysis.surplusByCapacity <= 0) {
            if (updateStatusFn) updateStatusFn('当前无人力富余，不建议执行富余增补方案', 'warning');
            return;
        }

        const result = await this.applySurplusBoostToDailyManpowerConfig();
        if (result.changed <= 0) {
            if (updateStatusFn) updateStatusFn('富余增补未生效（目标职能上限不可调整或配置未加载）', 'warning');
            return;
        }

        if (updateStatusFn) {
            updateStatusFn(`富余增补已生效：${result.labels.join('、')} 的上限各+1`, 'success');
        }
    },

    async handleQuickPlanCombined() {
        this.handleQuickPlanMergeRelief();
        await this.handleQuickPlanSurplusBoost();
        this.showMinimumManpowerConfig();
    },

    handleApplyTemplate(type) {
        if (typeof Store === 'undefined') return;
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        if (!scheduleConfig.startDate || !scheduleConfig.endDate) return;

        const dateList = this.getDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const config = this.getWorkingConfig();
        if (!config.weekdayTemplate || !config.specialTemplate || !config.dailyDemand) {
            return;
        }

        if (type === 'weekday') {
            this.updateTemplate(config, 'weekday');
            this.applyTemplateToDates(config, dateList, 'weekday', scheduleConfig);
        } else {
            this.updateTemplate(config, 'special');
            this.applyTemplateToDates(config, dateList, 'special', scheduleConfig);
        }

        this.showMinimumManpowerConfig();
    },

    saveConfig() {
        if (typeof Store === 'undefined') return;
        const config = this.getWorkingConfig();
        if (!config || !config.dailyDemand) return;

        this.persistConfig(config, true);

        const updateStatusFn = typeof StatusUtils !== 'undefined' && StatusUtils.updateStatus
            ? StatusUtils.updateStatus.bind(StatusUtils)
            : (typeof updateStatus === 'function' ? updateStatus : null);
        if (updateStatusFn) {
            updateStatusFn('每日最低人力配置已保存', 'success');
        }
    },

    showTotals() {
        const panel = document.getElementById('minimumManpowerTotalsPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
    }
};

if (typeof window !== 'undefined') {
    window.MinimumManpowerManager = MinimumManpowerManager;
}
