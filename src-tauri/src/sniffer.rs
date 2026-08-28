use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SniffedResult {
    pub brand: String,       // e.g. "openai", "gemini", "aliyun", "wechat", "aws", "ssh", "database"
    pub label: String,       // e.g. "ChatGPT / OpenAI Key", "阿里云 AccessKey"
    pub category: String,    // e.g. "ai", "cloud", "dev", "crypto", "database", "bot"
    pub snippet: Option<String>, // Masked preview or key identifier (e.g. "sk-...1234")
}

// Regex patterns compiled once
static RE_OPENAI: Lazy<Regex> = Lazy::new(|| Regex::new(r"sk-(proj-)?[a-zA-Z0-9_\-]{20,}").unwrap());
static RE_GEMINI: Lazy<Regex> = Lazy::new(|| Regex::new(r"AIzaSy[a-zA-Z0-9_\-]{30,45}").unwrap());
static RE_CLAUDE: Lazy<Regex> = Lazy::new(|| Regex::new(r"sk-ant-api[0-9]{2}-[a-zA-Z0-9_\-]{80,}").unwrap());
static RE_DEEPSEEK: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)deepseek[\s_:=]+sk-[a-zA-Z0-9]{20,}").unwrap());
static RE_HUGGINGFACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"hf_[a-zA-Z0-9]{34,}").unwrap());

static RE_ALIYUN_AK: Lazy<Regex> = Lazy::new(|| Regex::new(r"LTAI[a-zA-Z0-9]{16,24}").unwrap());
static RE_TENCENT_AK: Lazy<Regex> = Lazy::new(|| Regex::new(r"AKID[a-zA-Z0-9]{32,36}").unwrap());
static RE_BAIDU_AK: Lazy<Regex> = Lazy::new(|| Regex::new(r"ALTAK-[a-zA-Z0-9]{20,}").unwrap());
static RE_WECHAT_APPID: Lazy<Regex> = Lazy::new(|| Regex::new(r"wx[a-f0-9]{16}").unwrap());
static RE_FEISHU_APP: Lazy<Regex> = Lazy::new(|| Regex::new(r"cli_[a-z0-9]{16}").unwrap());
static RE_DINGTALK_APP: Lazy<Regex> = Lazy::new(|| Regex::new(r"ding[a-z0-9]{16}").unwrap());
static RE_WECOM_APP: Lazy<Regex> = Lazy::new(|| Regex::new(r"ww[a-z0-9]{16}").unwrap());

static RE_AWS_AK: Lazy<Regex> = Lazy::new(|| Regex::new(r"(AKIA|ASIA)[0-9A-Z]{16}").unwrap());
static RE_GITHUB_TOKEN: Lazy<Regex> = Lazy::new(|| Regex::new(r"(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})").unwrap());
static RE_GITLAB_TOKEN: Lazy<Regex> = Lazy::new(|| Regex::new(r"glpat-[a-zA-Z0-9\-_]{20,}").unwrap());
static RE_NPM_TOKEN: Lazy<Regex> = Lazy::new(|| Regex::new(r"npm_[a-zA-Z0-9]{36}").unwrap());

static RE_TELEGRAM_BOT: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b[0-9]{8,10}:[a-zA-Z0-9_\-]{35}\b").unwrap());
static RE_SLACK_TOKEN: Lazy<Regex> = Lazy::new(|| Regex::new(r"xox[baprs]-[0-9a-zA-Z]{10,48}").unwrap());
static RE_STRIPE_KEY: Lazy<Regex> = Lazy::new(|| Regex::new(r"[rs]k_(live|test)_[a-zA-Z0-9]{24,}").unwrap());

static RE_DB_URI: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(postgres|postgresql|mysql|mongodb(\+srv)?|redis|rediss|amqp|couchdb)://[^\s]+").unwrap()
});
static RE_JWT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\beyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\b").unwrap()
});

pub fn sniff_content(text: &str, filename_hint: Option<&str>) -> Vec<SniffedResult> {
    let mut results = Vec::new();
    let lower_text = text.to_lowercase();
    let filename_lower = filename_hint.unwrap_or("").to_lowercase();

    // 1. AI & LLMs
    if let Some(m) = RE_DEEPSEEK.find(text) {
        results.push(SniffedResult {
            brand: "deepseek".to_string(),
            label: "DeepSeek API Key".to_string(),
            category: "ai".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    } else if let Some(m) = RE_CLAUDE.find(text) {
        results.push(SniffedResult {
            brand: "claude".to_string(),
            label: "Anthropic Claude API Key".to_string(),
            category: "ai".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    } else if let Some(m) = RE_OPENAI.find(text) {
        results.push(SniffedResult {
            brand: "openai".to_string(),
            label: "ChatGPT / OpenAI API Key".to_string(),
            category: "ai".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_GEMINI.find(text) {
        results.push(SniffedResult {
            brand: "gemini".to_string(),
            label: "Google Gemini API Key".to_string(),
            category: "ai".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_HUGGINGFACE.find(text) {
        results.push(SniffedResult {
            brand: "huggingface".to_string(),
            label: "Hugging Face Token".to_string(),
            category: "ai".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    // 2. Domestic Cloud & Platforms (国内主流生态)
    if let Some(m) = RE_ALIYUN_AK.find(text) {
        results.push(SniffedResult {
            brand: "aliyun".to_string(),
            label: "阿里云 AccessKey ID".to_string(),
            category: "cloud".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_TENCENT_AK.find(text) {
        results.push(SniffedResult {
            brand: "tencent".to_string(),
            label: "腾讯云 SecretId".to_string(),
            category: "cloud".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_BAIDU_AK.find(text) {
        results.push(SniffedResult {
            brand: "baidu".to_string(),
            label: "百度智能云 AccessKey".to_string(),
            category: "cloud".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    // WeChat check
    let is_wechat = RE_WECHAT_APPID.is_match(text)
        || filename_lower.contains("apiclient")
        || lower_text.contains("mch_id")
        || lower_text.contains("v3_key")
        || lower_text.contains("wechat")
        || lower_text.contains("wxpay");
    if is_wechat {
        results.push(SniffedResult {
            brand: "wechat".to_string(),
            label: "微信生态 / 微信支付凭证".to_string(),
            category: "cloud".to_string(),
            snippet: Some("微信相关凭据".to_string()),
        });
    }

    if let Some(m) = RE_FEISHU_APP.find(text) {
        results.push(SniffedResult {
            brand: "collab".to_string(),
            label: "飞书开放平台 AppID/Secret".to_string(),
            category: "cloud".to_string(),
            snippet: Some(m.as_str().to_string()),
        });
    } else if let Some(m) = RE_DINGTALK_APP.find(text) {
        results.push(SniffedResult {
            brand: "collab".to_string(),
            label: "钉钉开放平台 AppKey".to_string(),
            category: "cloud".to_string(),
            snippet: Some(m.as_str().to_string()),
        });
    } else if let Some(m) = RE_WECOM_APP.find(text) {
        results.push(SniffedResult {
            brand: "collab".to_string(),
            label: "企业微信 CorpID/Secret".to_string(),
            category: "cloud".to_string(),
            snippet: Some(m.as_str().to_string()),
        });
    }

    // 3. Global Cloud & DevOps
    if let Some(m) = RE_AWS_AK.find(text) {
        results.push(SniffedResult {
            brand: "aws".to_string(),
            label: "AWS AccessKey ID".to_string(),
            category: "cloud".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if text.contains("\"type\": \"service_account\"") && text.contains("\"private_key\"") {
        results.push(SniffedResult {
            brand: "gcp".to_string(),
            label: "Google Cloud (GCP) 凭据 JSON".to_string(),
            category: "cloud".to_string(),
            snippet: Some("GCP Service Account".to_string()),
        });
    }

    if (text.contains("apiVersion:") && text.contains("kind: Config") && text.contains("clusters:"))
        || filename_lower == "config"
        || filename_lower == "kubeconfig"
    {
        results.push(SniffedResult {
            brand: "k8s".to_string(),
            label: "Kubernetes 集群配置 (Kubeconfig)".to_string(),
            category: "infra".to_string(),
            snippet: Some("K8s Config".to_string()),
        });
    }

    if let Some(m) = RE_GITHUB_TOKEN.find(text) {
        results.push(SniffedResult {
            brand: "github".to_string(),
            label: "GitHub Personal Access Token".to_string(),
            category: "dev".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_GITLAB_TOKEN.find(text) {
        results.push(SniffedResult {
            brand: "gitlab".to_string(),
            label: "GitLab Access Token".to_string(),
            category: "dev".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_NPM_TOKEN.find(text) {
        results.push(SniffedResult {
            brand: "npm".to_string(),
            label: "NPM Access Token".to_string(),
            category: "dev".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    // 4. Bot & Payments
    if let Some(m) = RE_TELEGRAM_BOT.find(text) {
        results.push(SniffedResult {
            brand: "telegram".to_string(),
            label: "Telegram Bot API Token".to_string(),
            category: "bot".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_SLACK_TOKEN.find(text) {
        results.push(SniffedResult {
            brand: "slack".to_string(),
            label: "Slack Bot/User Token".to_string(),
            category: "bot".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    if let Some(m) = RE_STRIPE_KEY.find(text) {
        results.push(SniffedResult {
            brand: "stripe".to_string(),
            label: "Stripe API Key".to_string(),
            category: "payment".to_string(),
            snippet: Some(mask_secret(m.as_str())),
        });
    }

    // 5. Cryptography & Database
    if text.contains("BEGIN RSA PRIVATE KEY")
        || text.contains("BEGIN OPENSSH PRIVATE KEY")
        || text.contains("BEGIN EC PRIVATE KEY")
        || text.contains("BEGIN DSA PRIVATE KEY")
        || text.contains("BEGIN PRIVATE KEY")
        || filename_lower.ends_with(".id_rsa")
        || filename_lower.ends_with(".pem") && text.contains("PRIVATE KEY")
    {
        results.push(SniffedResult {
            brand: "ssh".to_string(),
            label: "SSH / RSA 私钥 (Private Key)".to_string(),
            category: "crypto".to_string(),
            snippet: Some("-----BEGIN PRIVATE KEY-----".to_string()),
        });
    }

    if text.contains("BEGIN CERTIFICATE") || filename_lower.ends_with(".crt") || filename_lower.ends_with(".cer") {
        results.push(SniffedResult {
            brand: "ssl".to_string(),
            label: "SSL / TLS 证书 (Certificate)".to_string(),
            category: "crypto".to_string(),
            snippet: Some("-----BEGIN CERTIFICATE-----".to_string()),
        });
    }

    if text.contains("BEGIN PGP") {
        results.push(SniffedResult {
            brand: "pgp".to_string(),
            label: "PGP / GPG 密钥".to_string(),
            category: "crypto".to_string(),
            snippet: Some("PGP Key Block".to_string()),
        });
    }

    if let Some(m) = RE_DB_URI.find(text) {
        results.push(SniffedResult {
            brand: "database".to_string(),
            label: "数据库连接串 (DB Connection)".to_string(),
            category: "database".to_string(),
            snippet: Some(mask_db_url(m.as_str())),
        });
    }

    if let Some(m) = RE_JWT.find(text) {
        // avoid false positives on standard text
        if !results.iter().any(|r| r.brand == "openai" || r.brand == "claude") {
            results.push(SniffedResult {
                brand: "jwt".to_string(),
                label: "JWT 鉴权凭证 (Token)".to_string(),
                category: "crypto".to_string(),
                snippet: Some(mask_secret(m.as_str())),
            });
        }
    }

    if filename_lower.ends_with(".env") || filename_lower.contains(".env.") {
        results.push(SniffedResult {
            brand: "env".to_string(),
            label: "环境变量配置文件 (.env)".to_string(),
            category: "config".to_string(),
            snippet: Some(".env config".to_string()),
        });
    }

    results
}

fn mask_secret(secret: &str) -> String {
    if secret.len() <= 8 {
        return "****".to_string();
    }
    let start: String = secret.chars().take(6).collect();
    let end: String = secret.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("{}...{}", start, end)
}

fn mask_db_url(url: &str) -> String {
    if let Some(idx) = url.find("://") {
        let scheme = &url[0..idx];
        return format!("{}://***:***@...", scheme);
    }
    "db://...".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sniff_openai_key() {
        let text = "export OPENAI_API_KEY=sk-proj-abc12345678901234567890";
        let results = sniff_content(text, None);
        assert!(results.iter().any(|r| r.brand == "openai"));
    }

    #[test]
    fn test_sniff_gemini_key() {
        let text = "const GEMINI_KEY = 'AIzaSyD1234567890123456789012345678901';";
        let results = sniff_content(text, None);
        assert!(results.iter().any(|r| r.brand == "gemini"));
    }

    #[test]
    fn test_sniff_aliyun_ak() {
        let text = "aliyun.accessKeyId=LTAI5t7xxxxxxxxxxxxxx\naliyun.accessKeySecret=yyyy";
        let results = sniff_content(text, Some("application.properties"));
        assert!(results.iter().any(|r| r.brand == "aliyun"));
    }

    #[test]
    fn test_sniff_wechat() {
        let text = "wxpay_appid=wx1234567890abcdef\nmch_id=1900000109";
        let results = sniff_content(text, Some("wechat_config.yaml"));
        assert!(results.iter().any(|r| r.brand == "wechat"));
    }

    #[test]
    fn test_sniff_ssh_key() {
        let text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----";
        let results = sniff_content(text, Some("id_rsa"));
        assert!(results.iter().any(|r| r.brand == "ssh"));
    }
}
