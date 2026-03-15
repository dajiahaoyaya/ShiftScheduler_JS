/**
 * 城市维度工具
 * 统一 SH/CD 与 上海/成都 的映射，兼容历史字段 location。
 */

const CityUtils = {
    CITY_META: {
        SH: {
            code: 'SH',
            name: '上海',
            aliases: ['上海', '沪', 'sh', 'shanghai']
        },
        CD: {
            code: 'CD',
            name: '成都',
            aliases: ['成都', '蓉', 'cd', 'chengdu']
        }
    },

    getAllCityCodes() {
        return Object.keys(this.CITY_META);
    },

    getAllLocationNames() {
        return this.getAllCityCodes().map((cityCode) => this.CITY_META[cityCode].name);
    },

    normalizeCityScope(raw, fallback = 'ALL') {
        const str = String(raw == null ? '' : raw).trim().toUpperCase();
        if (str === 'SH' || str === 'CD' || str === 'ALL') return str;
        return fallback;
    },

    getCityScopeLabel(scope) {
        const normalized = this.normalizeCityScope(scope, 'ALL');
        if (normalized === 'SH') return '仅上海';
        if (normalized === 'CD') return '仅成都';
        return '上海+成都';
    },

    scopeAllowsCity(scope, cityCode) {
        const normalizedScope = this.normalizeCityScope(scope, 'ALL');
        const normalizedCity = this.normalizeCityCode(cityCode, null);
        if (!normalizedCity) return true;
        return normalizedScope === 'ALL' || normalizedScope === normalizedCity;
    },

    getActiveCityScope() {
        if (typeof Store === 'undefined' || !Store || typeof Store.getState !== 'function') {
            return 'ALL';
        }
        const state = typeof Store.getState === 'function' ? (Store.getState() || {}) : {};
        const currentView = String(state.currentView || '').trim();
        const currentConfigId = state.currentConfigId || null;

        const resolveFromView = (view, preferredConfigId = null) => {
            if (!view) return '';
            const v = String(view).trim();
            try {
                if (v === 'staff') {
                    const id = preferredConfigId || state.activeConfigId;
                    const cfg = id && typeof Store.getStaffConfig === 'function' ? Store.getStaffConfig(id) : null;
                    return this.normalizeCityScope(cfg && cfg.cityScope, '');
                }
                if (v === 'request') {
                    const id = preferredConfigId || state.activeRequestConfigId;
                    const cfg = id && typeof Store.getRequestConfig === 'function' ? Store.getRequestConfig(id) : null;
                    return this.normalizeCityScope(cfg && cfg.cityScope, '');
                }
                if (v === 'schedulePeriod') {
                    const id = preferredConfigId || state.activeSchedulePeriodConfigId;
                    const cfg = id && typeof Store.getSchedulePeriodConfig === 'function' ? Store.getSchedulePeriodConfig(id) : null;
                    return this.normalizeCityScope(cfg && cfg.cityScope, '');
                }
                if (v === 'fullRest') {
                    const id = preferredConfigId || state.activeFullRestConfigId;
                    const cfg = id && typeof Store.getFullRestConfig === 'function' ? Store.getFullRestConfig(id) : null;
                    return this.normalizeCityScope(cfg && cfg.cityScope, '');
                }
                if (v === 'nightShift') {
                    const id = preferredConfigId || state.activeNightShiftConfigId;
                    const cfg = id && typeof Store.getNightShiftConfig === 'function' ? Store.getNightShiftConfig(id) : null;
                    return this.normalizeCityScope(cfg && cfg.cityScope, '');
                }
                if (v === 'scheduleDisplay') {
                    const id = preferredConfigId || state.activeScheduleResultConfigId;
                    const cfg = id && typeof Store.getScheduleResultConfig === 'function' ? Store.getScheduleResultConfig(id) : null;
                    return this.normalizeCityScope(cfg && cfg.cityScope, '');
                }
                if (v === 'monthlySchedule' || v === 'monthlyShift') {
                    const id = preferredConfigId || state.activeMonthlyScheduleConfigId;
                    const cfg = id && typeof Store.getMonthlyScheduleConfig === 'function' ? Store.getMonthlyScheduleConfig(id) : null;
                    return this.normalizeCityScope(cfg && cfg.cityScope, '');
                }
            } catch (e) {
                return '';
            }
            return '';
        };

        const scopedFromCurrent = resolveFromView(currentView, currentConfigId);
        if (scopedFromCurrent) return scopedFromCurrent;

        const scopedFromViewActive = resolveFromView(currentView, null);
        if (scopedFromViewActive) return scopedFromViewActive;

        const directScope = this.normalizeCityScope(Store.getState('activeCityScope'), '');
        if (directScope) return directScope;

        const activeConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (activeConfigId && typeof Store.getSchedulePeriodConfig === 'function') {
            const cfg = Store.getSchedulePeriodConfig(activeConfigId);
            const fromConfig = this.normalizeCityScope(cfg && cfg.cityScope, '');
            if (fromConfig) return fromConfig;
        }
        return 'ALL';
    },

    inferElementCityCode(el) {
        if (!el || typeof el !== 'object') return null;

        const explicitScope = this.normalizeCityScope(el.getAttribute && el.getAttribute('data-city-scope'), '');
        if (explicitScope === 'SH' || explicitScope === 'CD') return explicitScope;

        const explicitCity = this.normalizeCityCode(el.getAttribute && el.getAttribute('data-city'), null);
        if (explicitCity) return explicitCity;

        const fields = [
            el.id || '',
            el.name || '',
            (typeof el.className === 'string' ? el.className : '')
        ].join(' ');
        if (/(^|[_\-\s])SH([_\-\s]|$)/i.test(fields) || /上海/.test(fields)) return 'SH';
        if (/(^|[_\-\s])CD([_\-\s]|$)/i.test(fields) || /成都/.test(fields)) return 'CD';

        if (typeof el.closest === 'function') {
            const row = el.closest('tr');
            if (row) {
                const rowText = String(row.innerText || row.textContent || '').trim();
                const hasSH = /上海|SH/.test(rowText);
                const hasCD = /成都|CD/.test(rowText);
                if (hasSH && !hasCD) return 'SH';
                if (hasCD && !hasSH) return 'CD';
            }
        }

        return null;
    },

    isTotalEditableElement(el) {
        if (!el || typeof el !== 'object') return false;
        if (el.getAttribute && el.getAttribute('data-city-total-editable') === '1') return true;
        const text = [
            el.id || '',
            el.name || '',
            (typeof el.className === 'string' ? el.className : ''),
            el.getAttribute ? (el.getAttribute('data-field') || '') : '',
            el.getAttribute ? (el.getAttribute('data-key') || '') : ''
        ].join(' ');
        if (/(^|[_\-\s])ALL([_\-\s]|$)/i.test(text) || /总计|合计|汇总|TOTAL/i.test(text)) {
            return true;
        }
        if (typeof el.closest === 'function') {
            const row = el.closest('tr');
            const rowText = row ? String(row.innerText || row.textContent || '') : '';
            if (/总计|合计|汇总|TOTAL/i.test(rowText)) {
                return true;
            }
        }
        return false;
    },

    detectScopeFromText(textLike) {
        const text = String(textLike || '').trim();
        if (!text) return null;
        const hasSH = /上海|沪|(^|[^A-Z])SH([^A-Z]|$)/i.test(text);
        const hasCD = /成都|蓉|(^|[^A-Z])CD([^A-Z]|$)/i.test(text);
        if (hasSH && !hasCD) return 'SH';
        if (hasCD && !hasSH) return 'CD';
        return null;
    },

    markRowScopedElements(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        const rows = container.querySelectorAll('tr');
        rows.forEach((row) => {
            const rowText = String(row.innerText || row.textContent || '').trim();
            const rowScope = this.detectScopeFromText(rowText);
            const isTotalRow = /总计|合计|汇总|TOTAL/i.test(rowText);
            const controls = row.querySelectorAll('input, select, textarea, button');
            controls.forEach((el) => {
                if (!el || typeof el !== 'object') return;
                if (isTotalRow) {
                    if (!el.getAttribute('data-city-total-editable')) {
                        el.setAttribute('data-city-total-editable', '1');
                    }
                    return;
                }
                if (rowScope && !el.getAttribute('data-city-scope')) {
                    el.setAttribute('data-city-scope', rowScope);
                }
            });
        });
    },

    markByNamePattern(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        const controls = container.querySelectorAll('input, select, textarea, button');
        controls.forEach((el) => {
            if (!el || typeof el !== 'object') return;
            const text = [
                el.id || '',
                el.name || '',
                (typeof el.className === 'string' ? el.className : ''),
                el.getAttribute ? (el.getAttribute('data-field') || '') : '',
                el.getAttribute ? (el.getAttribute('data-key') || '') : '',
                el.getAttribute ? (el.getAttribute('aria-label') || '') : '',
                el.getAttribute ? (el.getAttribute('title') || '') : ''
            ].join(' ');

            if (!el.getAttribute('data-city-total-editable')
                && (/(^|[_\-\s])ALL([_\-\s]|$)/i.test(text) || /总计|合计|汇总|TOTAL/i.test(text))) {
                el.setAttribute('data-city-total-editable', '1');
            }
            if (el.getAttribute('data-city-scope')) return;
            const scope = this.detectScopeFromText(text);
            if (scope) {
                el.setAttribute('data-city-scope', scope);
            }
        });
    },

    propagateScopedContainer(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        const scopedContainers = container.querySelectorAll('[data-city-scope]');
        scopedContainers.forEach((section) => {
            const scope = this.normalizeCityScope(section.getAttribute('data-city-scope'), '');
            if (!scope || (scope !== 'SH' && scope !== 'CD')) return;
            const controls = section.querySelectorAll('input, select, textarea, button');
            controls.forEach((el) => {
                if (!el.getAttribute('data-city-scope') && !el.getAttribute('data-city-total-editable')) {
                    el.setAttribute('data-city-scope', scope);
                }
            });
        });
    },

    applyExplicitScopeMarkers(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        this.markRowScopedElements(container);
        this.propagateScopedContainer(container);
        this.markByNamePattern(container);
    },

    setElementScopeLocked(el, shouldLock) {
        if (!el || typeof el !== 'object') return;
        const canDisable = ('disabled' in el);
        const lockClass = ['opacity-50', 'cursor-not-allowed', 'bg-gray-100'];

        if (shouldLock) {
            if (el.dataset.cityScopeLocked === '1') return;
            if (canDisable) {
                el.dataset.cityScopePrevDisabled = el.disabled ? '1' : '0';
                el.disabled = true;
            }
            lockClass.forEach((cls) => el.classList && el.classList.add(cls));
            el.dataset.cityScopeLocked = '1';
            return;
        }

        if (el.dataset.cityScopeLocked !== '1') return;
        if (canDisable) {
            const prev = el.dataset.cityScopePrevDisabled === '1';
            el.disabled = prev;
            delete el.dataset.cityScopePrevDisabled;
        }
        lockClass.forEach((cls) => el.classList && el.classList.remove(cls));
        delete el.dataset.cityScopeLocked;
    },

    applyScopeEditLock(container, scope) {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        this.applyExplicitScopeMarkers(container);
        const activeScope = this.normalizeCityScope(scope || this.getActiveCityScope(), 'ALL');
        const roleReadOnly = (typeof AccessGuard !== 'undefined'
            && AccessGuard
            && typeof AccessGuard.canMutateInCurrentContext === 'function')
            ? !AccessGuard.canMutateInCurrentContext()
            : false;
        const elements = container.querySelectorAll('input, select, textarea, button');

        elements.forEach((el) => {
            if (el.getAttribute && el.getAttribute('data-city-lock-ignore') === '1') return;
            if (roleReadOnly) {
                this.setElementScopeLocked(el, true);
                return;
            }
            if (this.isTotalEditableElement(el)) {
                this.setElementScopeLocked(el, false);
                return;
            }
            const elementCity = this.inferElementCityCode(el);
            if (!elementCity) {
                this.setElementScopeLocked(el, false);
                return;
            }
            const scopeBlocked = !this.scopeAllowsCity(activeScope, elementCity);
            const roleBlocked = (typeof AccessGuard !== 'undefined'
                && AccessGuard
                && typeof AccessGuard.canEditCity === 'function')
                ? !AccessGuard.canEditCity(elementCity)
                : false;
            const shouldLock = scopeBlocked || roleBlocked;
            this.setElementScopeLocked(el, shouldLock);
        });
    },

    getCityName(cityCode, fallback = '上海') {
        const code = this.normalizeCityCode(cityCode, null);
        if (!code) return fallback;
        return this.CITY_META[code] ? this.CITY_META[code].name : fallback;
    },

    normalizeCityCode(raw, fallback = 'SH') {
        if (raw == null) return fallback;
        const str = String(raw).trim();
        if (!str) return fallback;
        const upper = str.toUpperCase();
        if (this.CITY_META[upper]) return upper;

        const lower = str.toLowerCase();
        const found = this.getAllCityCodes().find((code) => {
            const aliases = this.CITY_META[code] && Array.isArray(this.CITY_META[code].aliases)
                ? this.CITY_META[code].aliases
                : [];
            return aliases.some((a) => String(a).toLowerCase() === lower);
        });
        return found || fallback;
    },

    normalizeLocationName(raw, fallback = '上海') {
        if (raw == null) return fallback;
        const str = String(raw).trim();
        if (!str) return fallback;
        const cityCode = this.normalizeCityCode(str, null);
        if (!cityCode || !this.CITY_META[cityCode]) return fallback;
        return this.CITY_META[cityCode].name;
    },

    getCityCodeFromLocation(location, fallback = 'SH') {
        return this.normalizeCityCode(location, fallback);
    },

    normalizeStaffCityFields(staffLike = {}, fallbackCity = 'SH') {
        const staff = staffLike && typeof staffLike === 'object' ? { ...staffLike } : {};
        const guessedCity = this.normalizeCityCode(staff.city || staff.location, fallbackCity);
        const city = guessedCity || fallbackCity;
        const location = this.getCityName(city, this.getCityName(fallbackCity, '上海'));
        staff.city = city;
        staff.location = location;
        return staff;
    }
};

if (typeof window !== 'undefined') {
    window.CityUtils = CityUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CityUtils;
}
