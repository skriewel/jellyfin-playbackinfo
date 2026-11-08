using Jellyfin.Plugin.PlaybackInfo.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.PlaybackInfo;

/// <summary>
/// Playback Info: shows video quality and play method in jellyfin-web's player controls.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Playback Info";

    public override Guid Id => Guid.Parse("67fca38c-954e-4db0-8a82-eaaaf1bde3da");

    public override string Description =>
        "Shows resolution, video codec, bitrate and the play method (Direct Play, Direct Stream or Transcoding, with the transcode reasons) in the web player while the playback controls are visible.";

    /// <summary>
    /// Changes whenever the configuration is saved, so browsers refetch the client script.
    /// </summary>
    public string CacheKey => $"{Version}-{AssetHash.Value}-{Configuration.Revision}";

    private static readonly Lazy<string> AssetHash = new(() =>
    {
        var asm = typeof(Plugin).Assembly;
        using var sha = System.Security.Cryptography.SHA256.Create();
        foreach (var name in new[] { "Web.playbackinfo.js", "Web.playbackinfo.css" })
        {
            using var s = asm.GetManifestResourceStream($"{typeof(Plugin).Namespace}.{name}");
            if (s is null)
            {
                continue;
            }

            using var ms = new MemoryStream();
            s.CopyTo(ms);
            var bytes = ms.ToArray();
            sha.TransformBlock(bytes, 0, bytes.Length, null, 0);
        }

        sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
        return Convert.ToHexString(sha.Hash!)[..10].ToLowerInvariant();
    });

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html"
            }
        };
    }

    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        if (configuration is PluginConfiguration cfg)
        {
            cfg.Revision = DateTime.UtcNow.Ticks;
        }

        base.UpdateConfiguration(configuration);
    }
}
