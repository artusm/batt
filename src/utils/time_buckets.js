import {
    Assign
} from 'utility-types';
import {
    isString,
    isObject as isObjectLodash,
    isPlainObject,
    sortBy
} from 'lodash';
import moment, {
    Moment
} from 'moment';
import {
    find
} from 'lodash';
import dateMath, {
    Unit
} from '@elastic/datemath';

import {
    convertDurationToNormalizedEsInterval,
    convertIntervalToEsInterval,
    EsInterval,
} from './calc_es_interval';

export const autoInterval = 'auto';

export const boundsDescendingRaw = [
    {
        bound: Infinity,
        interval: moment.duration(1, 'year'),
    },
    {
        bound: moment.duration(1, 'year'),
        interval: moment.duration(1, 'month'),
    },
    {
        bound: moment.duration(3, 'week'),
        interval: moment.duration(1, 'week'),
    },
    {
        bound: moment.duration(1, 'week'),
        interval: moment.duration(1, 'd'),
    },
    {
        bound: moment.duration(24, 'hour'),
        interval: moment.duration(12, 'hour'),
    },
    {
        bound: moment.duration(6, 'hour'),
        interval: moment.duration(3, 'hour'),
    },
    {
        bound: moment.duration(2, 'hour'),
        interval: moment.duration(1, 'hour'),
    },
    {
        bound: moment.duration(45, 'minute'),
        interval: moment.duration(30, 'minute'),
    },
    {
        bound: moment.duration(20, 'minute'),
        interval: moment.duration(10, 'minute'),
    },
    {
        bound: moment.duration(9, 'minute'),
        interval: moment.duration(5, 'minute'),
    },
    {
        bound: moment.duration(3, 'minute'),
        interval: moment.duration(1, 'minute'),
    },
    {
        bound: moment.duration(45, 'second'),
        interval: moment.duration(30, 'second'),
    },
    {
        bound: moment.duration(15, 'second'),
        interval: moment.duration(10, 'second'),
    },
    {
        bound: moment.duration(7.5, 'second'),
        interval: moment.duration(5, 'second'),
    },
    {
        bound: moment.duration(5, 'second'),
        interval: moment.duration(1, 'second'),
    },
    {
        bound: moment.duration(500, 'ms'),
        interval: moment.duration(100, 'ms'),
    },
];

const boundsDescending = boundsDescendingRaw.map(({ bound, interval }) => ({
    bound: Number(bound),
    interval: Number(interval),
}));

function getPerBucketMs(count: number, duration: number) {
    const ms = duration / count;
    return isFinite(ms) ? ms : NaN;
}

function normalizeMinimumInterval(targetMs: number) {
    const value = isNaN(targetMs) ? 0 : Math.max(Math.floor(targetMs), 1);
    return moment.duration(value);
}


export function calcAutoIntervalNear(targetBucketCount: number, duration: number) {
    const targetPerBucketMs = getPerBucketMs(targetBucketCount, duration);

    const lowerBoundIndex = boundsDescending.findIndex(({ bound }) => {
        const boundMs = Number(bound);
        return boundMs <= targetPerBucketMs;
    });

    if (lowerBoundIndex !== -1) {
        const nearestInterval = boundsDescending[lowerBoundIndex - 1].interval;
        return moment.duration(nearestInterval);
    }

    return normalizeMinimumInterval(targetPerBucketMs);
}

export function calcAutoIntervalLessThan(maxBucketCount: number, duration: number) {
    const maxPerBucketMs = getPerBucketMs(maxBucketCount, duration);

    for (const { interval } of boundsDescending) {
        if (interval <= maxPerBucketMs) {
            return moment.duration(interval);
        }
    }

    return normalizeMinimumInterval(maxPerBucketMs);
}


export interface TimeRangeBounds {
    min: Moment | undefined;
    max: Moment | undefined;
}

const INTERVAL_STRING_RE = new RegExp('^([0-9\\.]*)\\s*(' + dateMath.units.join('|') + ')$');

export const splitStringInterval = (interval: string) => {
    if (interval) {
        const matches = interval.toString().trim().match(INTERVAL_STRING_RE);
        if (matches) {
            return {
                value: parseFloat(matches[1]) || 1,
                unit: matches[2] as Unit,
            };
        }
    }
    return null;
};

export function parseInterval(interval: string): moment.Duration | null {
    const parsedInterval = splitStringInterval(interval);

    if (!parsedInterval) return null;

    try {
        const { value, unit } = parsedInterval;
        const duration = moment.duration(value, unit);

        const selectedUnit = find(dateMath.units, (u) => Math.abs(duration.as(u)) >= 1) as Unit;

        if (dateMath.units.indexOf(selectedUnit as any) < dateMath.units.indexOf(unit as any)) {
            return duration;
        }

        return moment.duration(duration.as(selectedUnit), selectedUnit);
    } catch (e) {
        return null;
    }
}


interface TimeBucketsInterval extends moment.Duration {
    description: string;
    esValue: EsInterval['value'];
    esUnit: EsInterval['unit'];
    expression: EsInterval['expression'];
    preScaled?: TimeBucketsInterval;
    scale?: number;
    scaled?: boolean;
}

function isObject(o: any): o is Record<string, any> {
    return isObjectLodash(o);
}

function isValidMoment(m: any): boolean {
    return m && 'isValid' in m && m.isValid();
}

function isDurationInterval(i: any): i is moment.Duration {
    return moment.isDuration(i) && Boolean(+i);
}

export interface TimeBucketsConfig extends Record<string, any> {
    'maxBars': number;
    'barTarget': number;
    dateFormat: string;
    'scaled': string[][];
}

export class TimeBuckets {
    private _timeBucketConfig: TimeBucketsConfig;
    private _lb: TimeRangeBounds['min'];
    private _ub: TimeRangeBounds['max'];
    private _originalInterval: string | null = null;
    private _i?: moment.Duration | 'auto';

    [key: string]: any;

    constructor(timeBucketConfig: TimeBucketsConfig) {
        this._timeBucketConfig = timeBucketConfig;
    }

    private getDuration(): moment.Duration | undefined {
        if (this._ub === undefined || this._lb === undefined || !this.hasBounds()) {
            return;
        }
        const difference = this._ub.valueOf() - this._lb.valueOf();
        return moment.duration(difference, 'ms');
    }

    setBounds(input?: TimeRangeBounds | TimeRangeBounds[]) {
        if (!input) return this.clearBounds();

        let bounds;
        if (isPlainObject(input) && !Array.isArray(input)) {
            bounds = [input.min, input.max];
        } else {
            bounds = Array.isArray(input) ? input : [];
        }

        const moments: Moment[] = sortBy(bounds, Number) as Moment[];

        const valid = moments.length === 2 && moments.every(isValidMoment);
        if (!valid) {
            this.clearBounds();
            throw new Error('установлены недопустимые интервалы: ' + input);
        }

        this._lb = moments.shift() as any;
        this._ub = moments.pop() as any;

        const duration = this.getDuration();
        if (!duration || duration.asSeconds() < 0) {
            throw new TypeError('Интервалы должны быть положительными');
        }
    }

    clearBounds() {
        this._lb = this._ub = undefined;
    }

    hasBounds(): boolean {
        return isValidMoment(this._ub) && isValidMoment(this._lb);
    }

    getBounds(): TimeRangeBounds | undefined {
        if (!this.hasBounds()) return;
        return {
            min: this._lb,
            max: this._ub,
        };
    }

    setInterval(input: null | string | Record<string, any>) {
        this._originalInterval = null;
        this._i = isObject(input) ? input.val : input;

        if (!this._i || this._i === autoInterval) {
            this._i = autoInterval;
            return;
        }

        if (isString(this._i)) {
            const parsedInterval = parseInterval(this._i);

            if (isDurationInterval(parsedInterval)) {
                this._originalInterval = this._i;
                this._i = parsedInterval;
            }
        }

        if (!isDurationInterval(this._i)) {
            throw new TypeError('"' + this._i + '" не допустимый интервал.');
        }
    }


    getInterval(useNormalizedEsInterval = true): TimeBucketsInterval {
        const duration = this.getDuration();
        const parsedInterval = isDurationInterval(this._i)
            ? this._i
            : calcAutoIntervalNear(this._timeBucketConfig['barTarget'], Number(duration));

        const maybeScaleInterval = (interval: moment.Duration) => {
            if (!this.hasBounds() || !duration) {
                return interval;
            }

            const maxLength: number = this._timeBucketConfig['maxBars'];
            const minInterval = calcAutoIntervalLessThan(maxLength, Number(duration));

            let scaled;

            if (interval < minInterval) {
                scaled = minInterval;
            } else {
                return interval;
            }

            interval = decorateInterval(interval);
            return Object.assign(scaled, {
                preScaled: interval,
                scale: Number(interval) / Number(scaled),
                scaled: true,
            });
        };

        const decorateInterval = (
            interval: Assign<moment.Duration, { scaled?: boolean }>
        ): TimeBucketsInterval => {
            let originalUnit: Unit | undefined;

            if (!interval.scaled && this._originalInterval) {
                originalUnit = splitStringInterval(this._originalInterval!)?.unit;
            }

            const esInterval = useNormalizedEsInterval
                ? convertDurationToNormalizedEsInterval(interval, originalUnit)
                : convertIntervalToEsInterval(String(this._originalInterval));

            const prettyUnits = moment.normalizeUnits(esInterval.unit);

            return Object.assign(interval, {
                description:
                    esInterval.value === 1 ? prettyUnits : esInterval.value + ' ' + prettyUnits + 's',
                esValue: esInterval.value,
                esUnit: esInterval.unit,
                expression: esInterval.expression,
            });
        };

        if (useNormalizedEsInterval) {
            return decorateInterval(maybeScaleInterval(parsedInterval));
        } else {
            return decorateInterval(parsedInterval);
        }
    }

    getScaledDateFormat() {
        const interval = this.getInterval();
        const rules = this._timeBucketConfig['scaled'];

        for (let i = rules.length - 1; i >= 0; i--) {
            const rule = rules[i];
            if (!rule[0] || (interval && interval >= moment.duration(rule[0]))) {
                return rule[1];
            }
        }

        return this._timeBucketConfig.dateFormat;
    }

    getHistogramDateRange() {
        return {
            min: this._lb!.milliseconds(),
            max: this._ub!.milliseconds(),
        };
    }
}

export const DEFAULT_CONFIG = {
    "maxBars": 15,
    "barTarget": 50,
    "scaled": [
        ["", "HH:mm:ss.fff"],
        ["PT1S", "HH:mm:ss"],
        ["PT1M", "HH:mm"],
        ["PT1H", "yyyy-MM-dd HH:mm"],
        ["P1DT", "yyyy-MM-dd"],
        ["P1MT", "MMMM yyyy"],
        ["P1YT", "yyyy"]
    ],
    dateFormat: "",
};
