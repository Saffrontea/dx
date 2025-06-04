const data = globalThis._input;
console.log(data.orderDetails.filter((v)=>{return v.parentOrderDetailUid == null }));
