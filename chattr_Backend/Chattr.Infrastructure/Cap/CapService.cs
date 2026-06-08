using System.Net;
using Chattr.Domain.Services;
using Chattr.Infrastructure.Extensions;
using Chattr.Infrastructure.Options;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Chattr.Infrastructure.Cap;

public sealed partial class CapService(
    [FromKeyedServices(HttpClientServiceKey.Cap)] HttpClient httpClient,
    IOptionsMonitor<CapOptions> opts,
    ILogger<CapService> logger) : ICapService
{
    public bool IsEnabled => opts.CurrentValue.Enabled && !string.IsNullOrWhiteSpace(opts.CurrentValue.SecretKey);

    public async Task<(bool Success, string? Error)> VerifyAsync(string token, string? clientIp, CancellationToken ct = default)
    {
        if (!IsEnabled) return (false, "CAPTCHA not configured.");
        var options = opts.CurrentValue;

        var fields = new List<KeyValuePair<string, string>>
        {
            new("secret",   options.SecretKey!),
            new("response", token),
            new("token",    token),
        };
        if (!string.IsNullOrWhiteSpace(clientIp)) fields.Add(new("remoteip", clientIp));

        Exception? last = null;
        foreach (var url in BuildCandidates(options))
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = new FormUrlEncodedContent(fields),
                };
                using var resp = await (httpClient.SendAsync(req, ct)).ConfigureAwait(false);
                var body = await (resp.Content.ReadAsStringAsync(ct)).ConfigureAwait(false);
                if (resp.StatusCode == HttpStatusCode.NotFound) continue;

                using var doc = System.Text.Json.JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("success", out var s) && s.GetBoolean())
                    return (true, null);
                var err = root.TryGetProperty("error", out var e) ? e.GetString() : null;
                return (false, string.IsNullOrWhiteSpace(err) ? "CAPTCHA verification failed." : err);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                last = ex;
            }
        }

        if (last is not null) Log.CapVerifyFailedForAllCandidates(logger, last);
        return (false, "CAPTCHA verification failed.");
    }

    private static IReadOnlyList<string> BuildCandidates(CapOptions o)
    {
        var results = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(o.SiteVerifyUrl)) results.Add(o.SiteVerifyUrl);
        if (!string.IsNullOrWhiteSpace(o.ApiBaseUrl))
        {
            var nb = o.ApiBaseUrl.Trim().TrimEnd('/') + "/";
            var sk = (o.SiteKey ?? "").Trim().Trim('/');
            results.Add($"{nb}siteverify");
            if (!string.IsNullOrWhiteSpace(sk))
            {
                results.Add($"{nb}{sk}/api/siteverify");
                results.Add($"{nb}{sk}/siteverify");
            }
        }
        return results.ToArray();
    }

    private static partial class Log
    {
        [LoggerMessage(EventId = 2200, Level = LogLevel.Warning, Message = "CAP verify failed for all candidates.")]
        internal static partial void CapVerifyFailedForAllCandidates(ILogger logger, Exception exception);
    }
}