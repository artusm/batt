import React, {useEffect, useState} from 'react';
import {EuiSelectable, EuiBadge} from "@elastic/eui";
import {client} from "../client";
import { get } from "get-wild";

const loadEslList = async () => {
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

        return get(data, "aggregations.langs.buckets");
    } catch (e) {
        return [];
    }
};

export const EslList = ({onChangeEsl = () => {}, isGlobalLoading = false}) => {
    const [isLoading, setIsloading] = useState(true);
    const [options, setOptions] = useState([]);

    useEffect(() => {
        const load = async () => {
            const buckets = await loadEslList();


            const options = buckets.map((b) => ({
                label: `${b.key.esl}`,
                esl: b.key.esl,
                append: <EuiBadge>{b.doc_count}</EuiBadge>,
            }));

            setOptions(options);
            setIsloading(false);
        };

        load();
    }, []);

    const onChange = (options) => {
       const esl = options.find((o) => o.checked === "on");

       if (onChangeEsl) {
           onChangeEsl(esl.esl);
       }
    };


    return (
        <EuiSelectable
            searchable
            isLoading={isLoading || isGlobalLoading}
            options={options}
            loadingMessage={isGlobalLoading ? "Загружаются данные" : "Идет загрузка esl"}
            singleSelection={true}
            onChange={onChange}
        >
            {(list, search) => (
                <>
                    {search}
                    {list}
                </>
            )}
        </EuiSelectable>
    );
}
