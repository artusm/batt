import express from 'express';
import {client} from "./client";
import {get} from "get-wild";
import moment from "moment";

const server = express();


const convertDatesToLocal = (dates) => {
    if (dates && Array.isArray(dates)) {
        return dates.map(d => moment(d).utcOffset(360).format('YYYY-MM-DD HH:mm:ss'))
    }

    return [];
}


server.get('/esl-list', async (req, res) => {
    try {
        const {data} = await client.post('http://localhost:9200/li-*/_search', {
            "size": 0,
            "aggs": {
                "langs": {
                    "composite": {
                        "size": 3000,
                        "sources": [
                            {
                                "esl": {
                                    "terms": {
                                        "field": "esl"
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        });

        res.json(get(data, "aggregations.langs.buckets"));
    } catch (e) {
        return res.json([]);
    }
});

server.get('/stat', async (req, res) => {
    const {start, end, esl} = req.query;
    const startTime = moment(start);
    const endTime = moment(end);

    try {
        const {data} = await client.post('http://localhost:9200/li-*/_search', {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {
                            "match": {
                                "esl": +esl
                            }
                        }
                    ],
                    "filter": [
                        {
                            "range": {
                                "@timestamp": {
                                    "gte": startTime.format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
                                    "lte": endTime.format("YYYY-MM-DDTHH:mm:ss.SSSZ")
                                }
                            }
                        }
                    ]
                }
            },
            "aggs": {
                "histogram_with_avg_batt_last": {
                    "auto_date_histogram": {
                        "field": "@timestamp",
                        "buckets": 20,
                    },
                    "aggs": {
                        "avg_batt_last": {
                            "avg": {
                                "field": "esl_database_status.batt_last"
                            }
                        }
                    }
                },
                "histogram_with_avg_batt_min": {
                    "auto_date_histogram": {
                        "field": "@timestamp",
                        "buckets": 20,
                    },
                    "aggs": {
                        "avg_batt_min": {
                            "avg": {
                                "field": "esl_database_status.batt_min"
                            }
                        }
                    }
                }
            }
        });

        const dates = convertDatesToLocal(get(data, 'aggregations.histogram_with_avg_batt_last.buckets.*.key_as_string') ?? []);
        const xxl1 = get(data, 'aggregations.histogram_with_avg_batt_last.buckets.*.avg_batt_last.value') ?? [];
        const xxl2 = get(data, 'aggregations.histogram_with_avg_batt_min.buckets.*.avg_batt_min.value') ?? [];

        res.json({
            dates,
            xxl1,
            xxl2
        });
    } catch (e) {
        res.json({});
    }
})

server.listen(3000, () => {
    console.log('Сервер зарущен')
})
