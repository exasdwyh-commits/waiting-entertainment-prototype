const originalFetch = globalThis.fetch;

const protectedResourceMetadata = {
  resource: "https://api.hyper3d.com/api",
  authorization_servers: ["https://api.hyper3d.com/api/grant/oauth"],
  scopes_supported: ["frontend:access", "offline_access"],
  bearer_methods_supported: ["header"],
};

const authorizationServerMetadata = {
  authorization_endpoint: "https://api.hyper3d.com/api/grant/oauth/authorize",
  device_authorization_endpoint:
    "https://api.hyper3d.com/api/grant/oauth/device_authorization",
  claims_parameter_supported: false,
  claims_supported: ["sub", "email", "name", "sid", "auth_time", "iss"],
  code_challenge_methods_supported: ["S256"],
  end_session_endpoint: "https://api.hyper3d.com/api/grant/oauth/session/end",
  grant_types_supported: [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code",
  ],
  issuer: "https://api.hyper3d.com/api/grant/oauth",
  jwks_uri: "https://api.hyper3d.com/api/grant/oauth/jwks",
  registration_endpoint: "https://api.hyper3d.com/api/grant/oauth/register",
  authorization_response_iss_parameter_supported: true,
  response_modes_supported: ["form_post", "fragment", "query"],
  response_types_supported: ["code"],
  scopes_supported: [
    "openid",
    "offline_access",
    "frontend:access",
    "rodin:generate",
    "rodin:read",
    "account:read",
    "email",
    "profile",
  ],
  subject_types_supported: ["public"],
  token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  token_endpoint_auth_signing_alg_values_supported: [
    "RS256",
    "PS256",
    "ES256",
    "Ed25519",
    "EdDSA",
  ],
  token_endpoint: "https://api.hyper3d.com/api/grant/oauth/token",
  id_token_signing_alg_values_supported: ["RS256"],
  pushed_authorization_request_endpoint:
    "https://api.hyper3d.com/api/grant/oauth/request",
  request_uri_parameter_supported: false,
  userinfo_endpoint: "https://api.hyper3d.com/api/grant/oauth/me",
  dpop_signing_alg_values_supported: ["ES256", "Ed25519", "EdDSA"],
  revocation_endpoint: "https://api.hyper3d.com/api/grant/oauth/revoke",
  client_id_metadata_document_supported: true,
  claim_types_supported: ["normal"],
};

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const isProtectedResourceMetadata =
    url.hostname === "api.hyper3d.com" &&
    url.pathname.endsWith("/.well-known/oauth-protected-resource");
  const isAuthorizationServerMetadata =
    url.hostname === "api.hyper3d.com" &&
    (url.pathname.includes("/.well-known/oauth-authorization-server") ||
      url.pathname.includes("/.well-known/openid-configuration"));

  if (isProtectedResourceMetadata) {
    return new Response(JSON.stringify(protectedResourceMetadata), {
      headers: { "content-type": "application/json" },
    });
  }

  if (isAuthorizationServerMetadata) {
    return new Response(JSON.stringify(authorizationServerMetadata), {
      headers: { "content-type": "application/json" },
    });
  }

  return originalFetch(input, init);
};
