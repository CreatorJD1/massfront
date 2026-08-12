package com.creatorjd.massfront;

import androidx.annotation.NonNull;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/* Google Play is the purchase UI and receipt issuer, not the entitlement
   authority. This bridge never grants cores/items and never acknowledges a
   token. JavaScript sends purchaseToken to the backend; only a verified
   backend response may update the account and acknowledge/consume it. */
@CapacitorPlugin(name = "MassfrontBilling")
public class MassfrontBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private volatile boolean ready = false;
    private final Map<String, ProductDetails> products = new ConcurrentHashMap<>();

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
        connect();
    }

    private void connect() {
        if (client == null || client.isReady()) { ready = client != null && client.isReady(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(@NonNull BillingResult result) {
                ready = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                JSObject state = billingState(result); notifyListeners("billingState", state, true);
            }
            @Override public void onBillingServiceDisconnected() {
                ready = false;
                JSObject state = new JSObject(); state.put("ready", false); state.put("code", -1);
                state.put("message", "Google Play Billing disconnected"); notifyListeners("billingState", state, true);
            }
        });
    }

    private JSObject billingState(BillingResult result) {
        JSObject out = new JSObject();out.put("ready", ready);out.put("code", result.getResponseCode());
        out.put("message", result.getDebugMessage());return out;
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (!ready) connect();
        JSObject out = new JSObject();out.put("ready", ready);out.put("platform", "google-play");
        out.put("receiptVerification", "server-required");call.resolve(out);
    }

    @PluginMethod
    public void queryProducts(PluginCall call) {
        JSArray ids = call.getArray("productIds");
        if (ids == null || ids.length() == 0) { call.reject("productIds is required"); return; }
        if (!ready) { connect(); call.reject("Google Play Billing is not ready"); return; }
        List<QueryProductDetailsParams.Product> query = new ArrayList<>();
        try {
            for (Object raw : ids.toList()) {
                String id = String.valueOf(raw).trim();if (id.isEmpty()) continue;
                query.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
            }
        } catch (Exception e) { call.reject("Invalid productIds", e); return; }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(query).build();
        client.queryProductDetailsAsync(params, (result, response) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject(result.getDebugMessage()); return; }
            JSArray rows = new JSArray();products.clear();
            for (ProductDetails p : response.getProductDetailsList()) {
                products.put(p.getProductId(), p);JSObject row = new JSObject();row.put("id", p.getProductId());
                row.put("name", p.getName());row.put("description", p.getDescription());
                ProductDetails.OneTimePurchaseOfferDetails offer = p.getOneTimePurchaseOfferDetails();
                if (offer != null) { row.put("price", offer.getFormattedPrice());row.put("priceMicros", offer.getPriceAmountMicros());row.put("currency", offer.getPriceCurrencyCode()); }
                rows.put(row);
            }
            JSObject out = billingState(result);out.put("products", rows);call.resolve(out);
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String id = call.getString("productId", "").trim();ProductDetails detail = products.get(id);
        if (!ready) { call.reject("Google Play Billing is not ready"); return; }
        if (detail == null) { call.reject("Query this product before purchase"); return; }
        BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail).build();
        BillingFlowParams flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(item)).build();
        getActivity().runOnUiThread(() -> {
            BillingResult result = client.launchBillingFlow(getActivity(), flow);JSObject out = billingState(result);
            out.put("launched", result.getResponseCode() == BillingClient.BillingResponseCode.OK);call.resolve(out);
        });
    }

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        if (!ready) { connect(); call.reject("Google Play Billing is not ready"); return; }
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
        client.queryPurchasesAsync(params, (result, list) -> {
            JSObject out = billingState(result);out.put("purchases", purchasesJson(list));call.resolve(out);
        });
    }

    private JSArray purchasesJson(List<Purchase> list) {
        JSArray rows = new JSArray();if (list == null) return rows;
        for (Purchase p : list) {JSObject row = new JSObject();row.put("products", new JSArray(p.getProducts()));
            row.put("purchaseToken", p.getPurchaseToken());row.put("state", p.getPurchaseState());
            row.put("pending", p.getPurchaseState() == Purchase.PurchaseState.PENDING);row.put("acknowledged", p.isAcknowledged());
            row.put("purchaseTime", p.getPurchaseTime());rows.put(row);}
        return rows;
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> list) {
        JSObject out = billingState(result);out.put("purchases", purchasesJson(list));
        out.put("grantAllowed", false);out.put("next", "verify-purchase-token-on-server");
        notifyListeners("purchaseUpdated", out, true);
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();ready = false;super.handleOnDestroy();
    }
}
