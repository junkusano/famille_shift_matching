function isPayload(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const data = value;
    return data.action === "create_sharefull_template"
        && data.command === "create_template"
        && typeof data.core_id === "string" && data.core_id.length > 0
        && typeof data.operation_key === "string" && data.operation_key.length > 0;
}
export function createSharefullCreateTemplateHandler(bridge) {
    return async (payload, signal, job) => {
        if (!bridge)
            throw new Error("RPA_EXTENSION_TOKEN is not configured; Chrome extension bridge is unavailable");
        if (!isPayload(payload))
            throw new Error("Invalid Sharefull template payload");
        return bridge.execute({ ...(job ?? {}), id: job?.id ?? "extension-command", job_type: "sharefull.create_template", payload }, signal);
    };
}
//# sourceMappingURL=sharefullCreateTemplate.js.map