#!/bin/bash
# Create a STABLE self-signed code-signing certificate ("Echo Local Signing") and
# import it into the login keychain, so Echo can be signed with a consistent identity
# (macOS then remembers Microphone / Screen Recording permissions across rebuilds).
# Free, no Apple Developer account. Run once; re-run only if the cert is deleted.
set -e
CN="Echo Local Signing"
TMP=$(mktemp -d)
cat > "$TMP/cert.conf" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = $CN
[v3]
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
basicConstraints = critical, CA:false
EOF
openssl req -x509 -newkey rsa:2048 -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -days 3650 -nodes -config "$TMP/cert.conf"
# -legacy + SHA1 PBE for macOS `security import` compatibility (OpenSSL 3.x default fails).
openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -out "$TMP/echo.p12" \
  -passout pass:echolocal -name "$CN" -legacy -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
# -A lets codesign use the key without a keychain ACL prompt.
security import "$TMP/echo.p12" -k "$HOME/Library/Keychains/login.keychain-db" -P echolocal -A
rm -rf "$TMP"
echo "✓ Certificado '$CN' creado e importado. Ahora corre scripts/build-and-install.sh"
