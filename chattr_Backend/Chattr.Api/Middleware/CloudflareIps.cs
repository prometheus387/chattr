namespace Chattr.Api.Middleware;

/// <summary>
/// Cloudflare's published IP ranges. Refresh by hitting
/// <c>https://api.cloudflare.com/client/v4/ips</c> and
/// replacing the contents of this file. The v4 and v6
/// lists are kept in two distinct constants so the
/// extension method on <see cref="IpBlockOptions"/>
/// can populate <see cref="IpBlockOptions.TrustedProxies"/>
/// without string parsing at request time.
///
/// As of 2024 these are stable; Cloudflare does add
/// ranges occasionally. The startup log emits a
/// "trusted-proxy count" line so the operator can spot
/// regressions.
/// </summary>
public static class CloudflareIps
{
    public static readonly IReadOnlyList<string> Ipv4 = new[]
    {
        "173.245.48.0/20",
        "103.21.244.0/22",
        "103.22.200.0/22",
        "103.31.4.0/22",
        "141.101.64.0/18",
        "108.162.192.0/18",
        "190.93.240.0/20",
        "188.114.96.0/20",
        "197.234.240.0/22",
        "198.41.128.0/17",
        "162.158.0.0/15",
        "104.16.0.0/13",
        "104.24.0.0/14",
        "172.64.0.0/13",
        "131.0.72.0/22",
    };

    public static readonly IReadOnlyList<string> Ipv6 = new[]
    {
        "2400:cb00::/32",
        "2606:4700::/32",
        "2803:f800::/32",
        "2405:b500::/32",
        "2405:8100::/32",
        "2a06:98c0::/29",
        "2c0f:f248::/32",
    };

    /// <summary>
    /// Convenience: copy the v4 + v6 ranges into
    /// <see cref="IpBlockOptions.TrustedProxies"/>.
    /// Call at startup (e.g. in Program.cs after
    /// <c>builder.Services.Configure&lt;IpBlockOptions&gt;(...)</c>).
    /// </summary>
    public static void ApplyAsTrustedProxies(this IpBlockOptions options)
    {
        foreach (var cidr in Ipv4) options.TrustedProxies.Add(cidr);
        foreach (var cidr in Ipv6) options.TrustedProxies.Add(cidr);
    }
}
