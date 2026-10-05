/* Validate imported/cloud data before any local storage mutation. */
(function (root) {
  "use strict";
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const fail = () => { throw new Error("Dados financeiros inválidos. Nenhum dado foi substituído."); };
  const record = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
    return value;
  };
  const text = (value, max = 80) => {
    if (typeof value !== "string" || !value.trim() || value.length > max) fail();
    return value;
  };
  const id = (value) => {
    if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(value)) fail();
    return value;
  };
  const amount = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER / 100) fail();
    return value;
  };
  const day = (value) => {
    if (!Number.isInteger(value) || value < 1 || value > 31) fail();
    return value;
  };
  const timestamp = (value) => {
    if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) fail();
    return value;
  };
  const date = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail();
    return value;
  };
  const list = (value, normalize) => {
    if (!Array.isArray(value) || value.length > 50000) fail();
    const result = value.map((item) => normalize(record(item)));
    if (new Set(result.map((item) => item.id)).size !== result.length) fail();
    return result;
  };
  function normalizeFinancialData(input) {
    record(input);
    const output = {};
    if (own(input, "settings")) {
      if (input.settings === null) output.settings = null;
      else {
        const settings = record(input.settings);
        if (typeof settings.completed !== "boolean") fail();
        output.settings = {
          completed: settings.completed,
          incomes: list(settings.incomes, (item) => ({id:id(item.id), type:text(item.type,60), name:text(item.name,60), amount:amount(item.amount), day:day(item.day)})),
          fixedExpenses: list(settings.fixedExpenses, (item) => ({id:id(item.id), name:text(item.name,60), category:text(item.category), amount:amount(item.amount), day:day(item.day)})),
        };
        if (own(settings, "createdAt")) {
          if (!Number.isFinite(settings.createdAt) || settings.createdAt < 0) fail();
          output.settings.createdAt = settings.createdAt;
        }
      }
    }
    if (own(input, "transactions")) output.transactions = list(input.transactions, (item) => {
      if (!["income", "expense"].includes(item.type)) fail();
      if (own(item, "createdAt") && (!Number.isFinite(item.createdAt) || item.createdAt < 0)) fail();
      return {id:id(item.id), type:item.type, description:text(item.description,60), amount:amount(item.amount), category:text(item.category), date:date(item.date), createdAt:item.createdAt ?? 0};
    });
    if (own(input, "paidFixed")) {
      const paid = record(input.paidFixed);
      output.paidFixed = {};
      for (const [key, entry] of Object.entries(paid)) {
        if (!/^\d{4}-(0[1-9]|1[0-2]):[a-zA-Z0-9._-]{1,128}$/.test(key)) fail();
        if (typeof entry === "boolean") output.paidFixed[key] = entry;
        else {
          record(entry);
          if (!["paid", "pending"].includes(entry.status)) fail();
          output.paidFixed[key] = {status:entry.status, paidAt:entry.paidAt == null ? null : timestamp(entry.paidAt)};
        }
      }
    }
    if (own(input, "local_modified_at")) output.local_modified_at = input.local_modified_at === null ? null : timestamp(input.local_modified_at);
    if (!Object.keys(input).length) return {settings:null,transactions:[],paidFixed:{}};
    if (!Object.keys(output).length) fail();
    if (new TextEncoder().encode(JSON.stringify(output)).length > 5 * 1024 * 1024) fail();
    return output;
  }
  root.FinancialValidation = Object.freeze({normalizeFinancialData});
  if (typeof module !== "undefined" && module.exports) module.exports = root.FinancialValidation;
})(globalThis);
