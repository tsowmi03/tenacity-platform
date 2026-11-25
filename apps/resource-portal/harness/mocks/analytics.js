export const EVENTS = new Proxy({}, { get: (_target, name) => String(name) });
export const analyticsEnvironment = () => "preview";
export const tagEvent = (event) => event;
export const initAnalytics = () => {};
export const syncAnalyticsUser = () => {};
export const track = () => {};
export const createJobOutcomeTracker = () => () => {};
