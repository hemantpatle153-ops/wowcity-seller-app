import type { ApiClient, Query } from "./client";
import type * as T from "./types";

/**
 * One typed function per API call (docs/api.md, src/api/types.ts). Screens use these through
 * TanStack Query; nothing else talks to the network.
 */
export function createEndpoints(client: ApiClient) {
  const origin = () => client.baseUrl.replace(/\/api\/v1\/?$/, "");

  return {
    auth: {
      ownerLogin: (body: T.OwnerLoginBody) => client.post<T.TokenPair>("/auth/owner-login", body, { auth: false }),
      staffLogin: (body: T.StaffLoginBody) => client.post<T.TokenPair>("/auth/staff-login", body, { auth: false }),
      otpRequest: (body: T.OtpRequestBody) => client.post<T.OtpRequestResponse>("/auth/otp/request", body, { auth: false }),
      otpVerify: (body: T.OtpVerifyBody) => client.post<T.OtpVerifyResponse>("/auth/otp/verify", body, { auth: false }),
      signup: (body: T.SignupBody) => client.post<T.SignupResponse>("/auth/signup", body, { auth: false }),
      logout: () => client.post<T.LogoutResponse>("/auth/logout")
    },
    me: () => client.get<T.MeResponse>("/me"),
    dashboard: (store?: string) => client.get<T.DashboardResponse>("/dashboard", { store }),

    catalog: {
      lookup: (q: string, storeId: string, inStock = true) => client.get<T.CatalogLookupResponse>("/catalog/lookup", { q, storeId, inStock: inStock ? undefined : "false" })
    },
    sync: {
      catalog: (query: { storeId: string; sinceAt?: string; sinceId?: string; limit?: number }) => client.get<T.SyncCatalogResponse>("/sync/catalog", query),
      customers: (query: { sinceAt?: string; sinceId?: string; limit?: number }) => client.get<T.SyncCustomersResponse>("/sync/customers", query)
    },

    sales: {
      post: (body: T.SaleRequest) => client.post<T.SaleResponse>("/sales", body, { timeoutMs: 30000 }),
      list: (query: { range?: string; from?: string; to?: string; view?: "bills" | "returns"; q?: string; store?: string; staff?: string; page?: number }) =>
        client.get<T.SalesListResponse>("/sales", query),
      get: (invoiceId: string) => client.get<T.SaleInvoice>(`/sales/${invoiceId}`),
      originalBill: (billNumber: string) => client.get<T.OriginalBillResponse>("/sales/original-bill", { billNumber })
    },
    customers: {
      search: (q: string) => client.get<T.CustomerSearchResponse>("/customers/search", { q }),
      list: (query: { q?: string; segment?: string; sort?: string; page?: number }) => client.get<T.CustomersResponse>("/customers", query),
      get: (id: string) => client.get<T.CustomerDetailResponse>(`/customers/${id}`),
      update: (id: string, body: T.CustomerUpdateBody) => client.patch<T.FormActionOk>(`/customers/${id}`, body)
    },

    stock: {
      list: (query: { q?: string; store?: string; status?: string; brand?: string; size?: string; colour?: string; category?: string; sort?: string; page?: number }) =>
        client.get<T.StockListResponse>("/stock", query),
      item: (variantId: string) => client.get<T.StockItemDetail>(`/stock/items/${variantId}`),
      adjust: (body: T.StockAdjustBody) => client.post<T.FormActionOk>("/stock/adjust", body),
      transfer: (body: T.StockTransferBody) => client.post<T.FormActionOk>("/stock/transfer", body)
    },
    products: {
      list: (query: { q?: string; filter?: string; page?: number }) => client.get<T.ProductListResponse>("/products", query),
      listing: (productId: string) => client.get<T.ProductListingResponse>(`/products/${productId}/listing`),
      saveListing: (productId: string, body: T.ProductListingBody) => client.put<T.FormActionOk>(`/products/${productId}/listing`, body),
      updateVariant: (productId: string, variantId: string, body: T.ProductVariantUpdateBody) => client.patch<T.FormActionOk>(`/products/${productId}/variants/${variantId}`, body)
    },
    customFields: {
      list: () => client.get<T.CustomFieldsResponse>("/custom-fields"),
      save: (body: T.CustomFieldSaveBody) => client.post<T.FormActionOk>("/custom-fields", body),
      archive: (fieldId: string, restore = false) => client.post<T.CustomFieldUpdatedResponse>(`/custom-fields/${fieldId}/archive`, { restore }),
      move: (fieldId: string, direction: "up" | "down") => client.post<T.CustomFieldUpdatedResponse>(`/custom-fields/${fieldId}/move`, { direction })
    },

    purchases: {
      setup: () => client.get<T.PurchaseSetupResponse>("/purchases/setup"),
      list: (query: { range?: string; from?: string; to?: string; q?: string; store?: string; supplier?: string; status?: string; page?: number }) =>
        client.get<T.PurchaseListResponse>("/purchases", query),
      get: (id: string) => client.get<T.PurchaseBill>(`/purchases/${id}`),
      barcodeLookup: (barcode: string) => client.get<T.PurchaseBarcodeLookupResponse>("/purchases/barcode-lookup", { barcode }),
      post: (body: T.PurchaseRequest) => client.post<T.PurchaseResponse>("/purchases", body, { timeoutMs: 45000 }),
      returnToSupplier: (purchaseId: string, body: T.PurchaseReturnBody) => client.post<T.PurchaseReturnResponse>(`/purchases/${purchaseId}/returns`, body),
      /** Presigned upload for a product photo (outside /api/v1). */
      imageUpload: (body: T.ProductImageUploadRequest) => client.post<T.ProductImageUploadResponse>(`${origin()}/api/r2/product-image-upload`, body)
    },
    suppliers: {
      list: (q?: string) => client.get<T.SuppliersResponse>("/suppliers", { q }),
      save: (body: T.SupplierSaveBody) => client.post<T.FormActionOk>("/suppliers", body)
    },
    labels: {
      search: (q: string) => client.get<T.LabelSearchResponse>("/labels/search", { q }),
      jobs: (query: { range?: string; source?: string; page?: number }) => client.get<T.LabelJobsResponse>("/labels/jobs", query),
      job: (jobId: string) => client.get<T.LabelJobResponse>(`/labels/jobs/${jobId}`),
      recordPrint: (body: T.LabelPrintBody) => client.post<T.LabelPrintResponse>("/labels/prints", body)
    },

    dues: {
      list: (query: { party?: "customer" | "supplier"; filter?: string; q?: string; page?: number }) => client.get<T.DuesListResponse>("/dues", query),
      statement: (party: "customer" | "supplier", id: string) => client.get<T.DuesStatementResponse>(`/dues/${party}/${id}`),
      record: (body: T.DueEntryBody) => client.post<T.FormActionOk>("/dues/entries", body)
    },

    reports: {
      index: () => client.get<T.ReportsIndexResponse>("/reports"),
      run: (slug: string, query: Query) => client.get<T.ReportResponse>(`/reports/${slug}`, query),
      exportCsv: (slug: string, query: Query) => client.get<string>(`${origin()}/api/reports/${slug}/export`, query, { text: true })
    },

    staff: {
      list: () => client.get<T.StaffListResponse>("/staff"),
      get: (id: string) => client.get<T.StaffDetailResponse>(`/staff/${id}`),
      create: (body: T.StaffCreateBody) => client.post<T.StaffCreateResponse>("/staff", body),
      updateProfile: (id: string, body: T.StaffProfileBody) => client.patch<T.FormActionOk>(`/staff/${id}`, body),
      updateAccess: (id: string, body: T.StaffAccessBody) => client.put<T.FormActionOk>(`/staff/${id}/access`, body),
      updateShifts: (id: string, body: T.StaffShiftsBody) => client.put<T.FormActionOk>(`/staff/${id}/shifts`, body),
      resetPin: (id: string, body: T.StaffPinBody) => client.post<T.FormActionOk>(`/staff/${id}/pin`, body),
      setStatus: (id: string, body: T.StaffStatusBody) => client.post<T.FormActionOk>(`/staff/${id}/status`, body),
      signOut: (id: string) => client.post<T.FormActionOk>(`/staff/${id}/sign-out`, {}),
      lockdown: (lock: boolean) => client.post<T.FormActionOk>("/staff/lockdown", { lock })
    },
    devices: {
      list: () => client.get<T.DevicesResponse>("/devices"),
      revoke: (id: string) => client.delete<T.FormActionOk>(`/devices/${id}`)
    },
    stores: {
      list: () => client.get<T.StoresResponse>("/stores"),
      save: (body: T.StoreSaveBody) => client.post<T.FormActionOk>("/stores", body),
      close: (id: string, body: T.StoreCloseBody) => client.post<T.FormActionOk>(`/stores/${id}/close`, body),
      reopen: (id: string, body: T.StoreReopenBody) => client.post<T.FormActionOk>(`/stores/${id}/reopen`, body)
    },
    settings: {
      get: () => client.get<T.SettingsResponse>("/settings"),
      profile: (body: T.SettingsProfileBody) => client.put<T.FormActionOk>("/settings/profile", body),
      tax: (body: T.SettingsTaxBody) => client.put<T.FormActionOk>("/settings/tax", body),
      invoice: (body: T.SettingsInvoiceBody) => client.put<T.FormActionOk>("/settings/invoice", body),
      password: (body: T.SettingsPasswordBody) => client.post<T.FormActionOk>("/settings/password", body)
    },
    account: {
      /** Store requirement: owner deletes the account (closes the shop). Backend endpoint is being added. */
      delete: (shopCode: string) => client.delete<{ deleted: true; message?: string }>("/account", { confirm: shopCode })
    }
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
