// Account-scoped synchronization. Requires app state and FinancialValidation.
async function fetchCloudFinancialData(context = accountContext()) {
  if (!context.userId) return null;
  const { data, error } = await supabaseClient
    .from("financial_data")
    .select("data, updated_at")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function showCloudConflict(row) {
  row = { ...row, data: FinancialValidation.normalizeFinancialData(row.data) };
  CLOUD.conflict = true;
  CLOUD.remoteConflict = row;
  clearTimeout(CLOUD.syncTimer);
  CLOUD.syncTimer = null;
  markSyncDirty();
  $("#syncConflict").classList.remove("hidden");
  updateSyncUI("Dados diferentes nos aparelhos \u2014 escolha quais manter", "sync-warn");
}

async function uploadLocalToCloud({ silent = false, force = false } = {}) {
  if (!CLOUD.user) return;
  if (CLOUD.conflict && !force) {
    updateSyncUI("Há alterações diferentes nos aparelhos — escolha quais dados manter", "sync-warn");
    return false;
  }
  const context = accountContext();
  let failed = false;
  let retryable = true;

  if (!navigator.onLine) {
    markSyncDirty();
    updateSyncUI("Offline — alterações salvas neste aparelho", "sync-warn");
    return;
  }

  if (CLOUD.syncing) {
    CLOUD.pendingSync = true;
    return;
  }

  const payload = localFinancialPayload();
  const signature = payloadSignature(payload);
  const lastSignature = lastKnownSignature();

  // No write request if nothing changed.
  if (!force && !isSyncDirty() && lastSignature && signature === lastSignature) {
    const lastSync = localStorage.getItem(KEYS.lastSync);
    updateSyncUI(
      lastSync
        ? `Tudo sincronizado • ${new Date(lastSync).toLocaleString("pt-BR")}`
        : "Tudo sincronizado",
      "sync-ok"
    );
    return;
  }

  CLOUD.syncing = true;
  CLOUD.pendingSync = false;
  if (!silent) updateSyncUI("Sincronizando...", "sync-warn");

  const now = new Date().toISOString();

  try {
    let revision = force && CLOUD.conflict ? CLOUD.remoteConflict?.updated_at : localStorage.getItem(KEYS.cloudRevision);
    if (!revision) {
      const existing = await fetchCloudFinancialData(context);
      if (!isCurrentAccount(context)) return false;
      if (existing) {
        showCloudConflict(existing);
        return false;
      }
    }
    // The server accepts the update only while this exact revision still exists.
    const result = revision
      ? await supabaseClient.from("financial_data").update({ data: payload })
          .eq("user_id", context.userId).eq("updated_at", revision).select("updated_at").maybeSingle()
      : await supabaseClient.from("financial_data").insert({ user_id: context.userId, data: payload })
          .select("updated_at").maybeSingle();
    if (!isCurrentAccount(context)) return false;
    if (result.error?.code === "23505" || (!result.error && !result.data)) {
      const latest = await fetchCloudFinancialData(context);
      if (!isCurrentAccount(context)) return false;
      if (!latest) throw new Error("Cloud row unavailable after conditional write");
      showCloudConflict(latest);
      return false;
    }
    if (result.error) throw result.error;
    if (!result.data?.updated_at) throw new Error("Missing server revision");
    CLOUD.lastCloudUpdate = result.data.updated_at;
    localStorage.setItem(KEYS.cloudRevision, result.data.updated_at);
    localStorage.setItem(KEYS.lastSync, now);
    markSyncClean(signature);
    CLOUD.retryCount = 0;
    updateSyncUI(`Sincronizado em ${new Date(now).toLocaleString("pt-BR")}`, "sync-ok");
    return true;
  } catch (error) {
    if (!isCurrentAccount(context)) return false;
    failed = true;
    retryable = ![400, 401, 403].includes(Number(error.status || error.statusCode)) && !["42501", "23514"].includes(error.code);
    console.error(error);
    markSyncDirty();
    updateSyncUI("Falha ao sincronizar — seus dados continuam salvos localmente", "sync-error");
    if (!silent) toast("Não foi possível sincronizar com a nuvem.");
    return false;
  } finally {
    // A previous account's response must never modify the current account's state.
    if (!isCurrentAccount(context)) return;
    CLOUD.syncing = false;

    // If something changed while a request was in flight, one new grouped sync is enough.
    if (!CLOUD.loggingOut && (CLOUD.pendingSync || payloadSignature(localFinancialPayload()) !== signature)) {
      CLOUD.pendingSync = false;
      scheduleCloudSync();
    } else if (failed && retryable && !CLOUD.loggingOut && navigator.onLine && CLOUD.retryCount < 3) {
      scheduleCloudSync({ retry: true });
    } else if (!failed && !CLOUD.loggingOut && hasUnsyncedChanges()) {
      scheduleCloudSync();
    }
  }
}

function scheduleCloudSync({ retry = false } = {}) {
  if (!CLOUD.user || CLOUD.loggingOut || CLOUD.conflict) return;
  const context = accountContext();
  clearTimeout(CLOUD.syncTimer);
  markSyncDirty();
  if (!retry) CLOUD.retryCount = 0;
  const delay = retry ? [10000, 30000, 60000][CLOUD.retryCount++] : CLOUD.debounceMs;
  updateSyncUI(retry ? `Salvo no aparelho • nova tentativa em ${delay / 1000}s` : "Alterações salvas • sincronização em instantes", "sync-warn");

  CLOUD.syncTimer = setTimeout(() => {
    CLOUD.syncTimer = null;
    if (isCurrentAccount(context)) uploadLocalToCloud({ silent: true });
  }, delay);
}

async function reconcileCloudAndLocal(context = accountContext()) {
  updateSyncUI("Carregando seus dados...", "sync-warn");

  CLOUD.lastSyncedSignature = localStorage.getItem(KEYS.lastSignature);

  let cloudRow = null;
  try {
    cloudRow = await fetchCloudFinancialData(context);
  } catch (error) {
    if (!isCurrentAccount(context)) return;
    console.error(error);
    CLOUD.ready = true;
    updateSyncUI(
      currentAccountHasLocalData()
        ? (isSyncDirty()
            ? "Sem acesso à nuvem — há alterações pendentes neste aparelho"
            : "Sem acesso à nuvem — usando os dados locais desta conta")
        : "Sem acesso à nuvem — esta conta ainda não possui dados locais",
      "sync-error"
    );
    return;
  }
  if (!isCurrentAccount(context)) return;

  if (cloudRow) {
    try {
      cloudRow.data = FinancialValidation.normalizeFinancialData(cloudRow.data);
    } catch (error) {
      CLOUD.ready = false;
      updateSyncUI("Dados da nuvem inválidos — os dados locais foram preservados", "sync-error");
      return;
    }
    CLOUD.lastCloudUpdate = cloudRow.updated_at;

    const localHasUnsyncedWork = currentAccountHasLocalData() && isSyncDirty();
    if (localHasUnsyncedWork && localStorage.getItem(KEYS.cloudRevision) !== cloudRow.updated_at) {
      CLOUD.ready = true;
      CLOUD.conflict = true;
      CLOUD.remoteConflict = cloudRow;
      $("#syncConflict").classList.remove("hidden");
      updateSyncUI("Há alterações locais e dados mais recentes na nuvem — escolha quais manter", "sync-warn");
      return;
    }

    // Preserve offline/local edits instead of silently overwriting them.
    if (localHasUnsyncedWork) {
      CLOUD.ready = true;
      await uploadLocalToCloud({ silent: true });
      return;
    }

    try {
      applyCloudPayload(cloudRow.data || {});
    } catch (error) {
      console.error(error);
      CLOUD.ready = false;
      updateSyncUI("Dados da nuvem inválidos — os dados locais foram preservados", "sync-error");
      return;
    }
    localStorage.setItem(KEYS.cloudRevision, cloudRow.updated_at);
    localStorage.setItem(KEYS.lastSync, cloudRow.updated_at || new Date().toISOString());
    markSyncClean();
    CLOUD.ready = true;
    updateSyncUI("Dados desta conta carregados da nuvem", "sync-ok");
    return;
  }

  if (currentAccountHasLocalData() && hasMeaningfulLocalData()) {
    CLOUD.ready = true;
    markSyncDirty();
    await uploadLocalToCloud({ silent: true });
    return;
  }

  const migratedLegacy = migrateLegacyDataOnceForUser();
  if (migratedLegacy && hasMeaningfulLocalData()) {
    CLOUD.ready = true;
    markSyncDirty();
    await uploadLocalToCloud({ silent: true });
    return;
  }

  clearCurrentAccountLocalData();
  CLOUD.ready = true;
  markSyncClean();
  updateSyncUI("Nova conta — comece sua configuração financeira", "sync-ok");
}

