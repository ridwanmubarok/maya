export const logger = {
  info: (message: string, extra?: any) => {
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`, extra !== undefined ? extra : "");
  },
  warn: (message: string, extra?: any) => {
    console.warn(`[WARN] [${new Date().toISOString()}] ${message}`, extra !== undefined ? extra : "");
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error !== undefined ? error : "");
  },
  debug: (message: string, extra?: any) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEBUG] [${new Date().toISOString()}] ${message}`, extra !== undefined ? extra : "");
    }
  }
};
