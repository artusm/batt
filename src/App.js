import './App.css';
import {
    EuiPage,
    EuiPageBody,
    EuiPageHeader,
    EuiPageContent,
    EuiPageContentBody,
    EuiPageSideBar,
    EuiSelectable
} from "@elastic/eui";
import {EslList} from "./components/esl-list";
import {Datepicker} from "./components/datepicker";
import {useEffect, useState} from "react";
import {client} from "./client";
import {get} from "get-wild";
import moment from "moment";
import Chart from "react-apexcharts";

const convertDatesToLocal = (dates) => {
    if (dates && Array.isArray(dates)) {
        return dates.map(d => moment(d).utcOffset(180).format('YYYY-MM-DD HH:mm:ss'))
    }

    return [];
}

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

const KEY = atob('Rm9taWNob3YgTE9Y')

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const loadData = async (esl, startTime, endTime) => {
    try {
        const {data} = await client.post('http://localhost:9200/li-*/_search', {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {
                            "match": {
                                "esl": esl
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

        return {
            dates,
            xxl1,
            xxl2
        };
    } catch (e) {
        return [];
    }
};

const useData = () => {
    const [esl, setEsl] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [startTime, setStartTime] = useState(null);
    const [endTime, setEndTime] = useState(null);
    const [data, setData] = useState(null);

    const onChangeEsl = (esl) => {
        setEsl(esl);
    };

    const onTimeChange = (start, end) => {
        setStartTime(start);
        setEndTime(end);
    };

    useEffect(() => {
        if (esl && startTime && endTime) {
            const load = async () => {
                try {
                    const data = await loadData(esl, startTime, endTime);
                    setData(data);
                } catch (e) {}

                setIsLoading(false);
            };
            setIsLoading(true);
            load();
        }
    }, [esl, startTime, endTime]);

    return {
        data,
        isLoading,
        onChangeEsl,
        onTimeChange,
    }
}


function App() {
  const {data, onChangeEsl, isLoading, onTimeChange} = useData();
  console.log(data)
  return (
      <EuiPage paddingSize="none">
          <EuiPageSideBar sticky>
              <EslList onChangeEsl={onChangeEsl} isGlobalLoading={isLoading} />
          </EuiPageSideBar>

          <EuiPageBody panelled>
              <EuiPageHeader
                  iconType="visBarVertical"
                  pageTitle="Мониторинг батареек"
                  description={KEY}
                  rightSideItems={[<Datepicker isLoading={isLoading} onChange={onTimeChange}/>]}
              />

              <EuiPageContent
                  hasBorder={false}
                  hasShadow={false}
                  paddingSize="none"
                  color="transparent"
                  borderRadius="none">
                  <EuiPageContentBody>
                      {data && <Chart
                          options={getOptions(data)}
                          series={getSeries(data)}
                          type="area"
                          width="1200"
                      />}
                  </EuiPageContentBody>
              </EuiPageContent>
          </EuiPageBody>
      </EuiPage>
  );
}

function getOptions(data) {
    return {
        chart: {
        height: 350,
            type: 'area'
    },
    dataLabels: {
        enabled: false
    },
    stroke: {
        curve: 'smooth'
    },
    xaxis: {
        type: 'datetime',
        categories: data.dates
    },
    tooltip: {
        x: {
            format: 'dd.MM.yy HH:mm'
        },
        labels: {
            datetimeUTC: false,
        }
    },
    }
}

function getSeries(data) {
    return [
        {
            name: "batt_last",
            data: data.xxl1
        },
        {
            name: "batt_min",
            data: data.xxl2,
        }
    ]
}



export default App;
