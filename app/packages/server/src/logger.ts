function extractErr(obj: any) {
  if (obj && obj.err instanceof Error) {
    return { ...obj, err: { message: obj.err.message, stack: obj.err.stack } };
  }
  return obj;
}

export const logger = {
  info: (obj: any, msg?: string) => {
    if (typeof obj === 'string') {
      console.log(JSON.stringify({ level: 'info', msg: obj, time: new Date().toISOString() }));
    } else {
      console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), ...extractErr(obj), msg: msg || obj?.msg }));
    }
  },
  error: (obj: any, msg?: string) => {
    if (typeof obj === 'string') {
      console.error(JSON.stringify({ level: 'error', msg: obj, time: new Date().toISOString() }));
    } else {
      console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), ...extractErr(obj), msg: msg || obj?.msg }));
    }
  },
  warn: (obj: any, msg?: string) => {
    if (typeof obj === 'string') {
      console.warn(JSON.stringify({ level: 'warn', msg: obj, time: new Date().toISOString() }));
    } else {
      console.warn(JSON.stringify({ level: 'warn', time: new Date().toISOString(), ...extractErr(obj), msg: msg || obj?.msg }));
    }
  }
};
