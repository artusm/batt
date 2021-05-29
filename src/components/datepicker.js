import React, {useEffect, useState} from 'react';
import {EuiSuperDatePicker} from "@elastic/eui";
import dateMath from '@elastic/datemath';

export const Datepicker = ({isLoading = false, onChange = () => {}}) => {
    const [start, setStart] = useState('now-30m');
    const [end, setEnd] = useState('now');

    const onTimeChange = ({start, end}) => {
        setStart(start);
        setEnd(end);
        const startMoment = dateMath.parse(start);

        if (!startMoment || !startMoment.isValid()) {
            throw new Error('Не удалось распарсить начальную дату');
        }

        const endMoment = dateMath.parse(end, { roundUp: true });
        if (!endMoment || !endMoment.isValid()) {
            throw new Error('Не удалось распарсить дату оканчание');
        }

        console.log(startMoment.utc(), endMoment.utc())

        if (onChange) {
            onChange(startMoment.utc(), endMoment.utc())
        }
    };

    useEffect(() => {
        onTimeChange({start, end})
    }, [])


    return (
        <EuiSuperDatePicker
            isLoading={isLoading}
            start={start}
            end={end}
            onTimeChange={onTimeChange}
        />
    );
}
