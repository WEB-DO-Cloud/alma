const { withProjectBuildGradle } = require("expo/config-plugins");

const CREDENTIALS = "androidx.credentials:credentials:1.6.0";
const PLAY_SERVICES = "androidx.credentials:credentials-play-services-auth:1.6.0";
const MARKER = "alma-credential-versions";

/** react-native-passkeys pins an alpha Credential Manager. Force the latest stable. */
function forceCredentialVersions(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  return `${gradle}
// ${MARKER}
subprojects {
  configurations.configureEach {
    resolutionStrategy {
      force "${CREDENTIALS}"
      force "${PLAY_SERVICES}"
    }
  }
}
`;
}

function withCredentialVersions(config) {
  return withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = forceCredentialVersions(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withCredentialVersions;
module.exports.forceCredentialVersions = forceCredentialVersions;
module.exports.CREDENTIALS = CREDENTIALS;
module.exports.PLAY_SERVICES = PLAY_SERVICES;
