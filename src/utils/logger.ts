export const logger = {
  info: (message: string) => {
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[WARN] [${new Date().toISOString()}] ${message}`);
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error || "");
  },
  debug: (message: string) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEBUG] [${new Date().toISOString()}] ${message}`);
    }
  }
};
