const data = globalThis._input;
const tokyo =Object.keys(Object.fromEntries(
    Object.entries(data.offices)
        .filter(
            ([key, value]) =>
                Object.entries(value)
                    .some(
                        ([k, v]) =>
                            k=== "enName" && v === "Tokyo"
                    )
        )))[0];

const tokyoUrl = 'https://www.jma.go.jp/bosai/forecast/data/forecast/'+tokyo+'.json';
const fetchedTokyoData = await Promise.resolve(fetch(tokyoUrl).then(res => res.json()));
const result = fetchedTokyoData.map(v => v.timeSeries.map(v => {
    const dates = v.timeDefines;
    if (!v.areas.some(v=>v.weathers)) return [];
    const name = v.areas.map(v=>v.area.name).flat();
    const weather = v.areas.map(v=>v.weathers).flat();
    const combined = dates.map((v,i)=>({date:v,name:name,weather:weather}));
    return combined;
}).filter(v=>v.length > 0).flat()).flat();
console.log(JSON.stringify(result));