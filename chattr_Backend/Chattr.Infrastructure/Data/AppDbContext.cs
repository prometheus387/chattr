using Chattr.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<UserPgpKey> UserPgpKeys { get; set; }
    public DbSet<PlatformInvite> PlatformInvites { get; set; }
    public DbSet<SystemSetting> SystemSettings { get; set; }

    public DbSet<Guild> Guilds { get; set; }
    public DbSet<GuildMember> GuildMembers { get; set; }
    public DbSet<GuildMemberRole> GuildMemberRoles { get; set; }
    public DbSet<GuildRole> GuildRoles { get; set; }
    public DbSet<GuildRolePermissions> GuildRolePermissions { get; set; }
    public DbSet<GuildInvite> GuildInvites { get; set; }
    public DbSet<GuildBan> GuildBans { get; set; }
    public DbSet<GuildVouch> GuildVouches { get; set; }

    // ---- E2EE (Phase 2) ------------------------------------------------
    public DbSet<Chattr.Core.Entities.E2EE.Channel> E2eeChannels { get; set; }
    public DbSet<Chattr.Core.Entities.E2EE.ChannelMember> E2eeChannelMembers { get; set; }
    public DbSet<Chattr.Core.Entities.E2EE.Message> E2eeMessages { get; set; }
    public DbSet<Chattr.Core.Entities.E2EE.GroupChannelKey> E2eeGroupChannelKeys { get; set; }

    public DbSet<Channel> Channels { get; set; }
    public DbSet<Message> Messages { get; set; }

    public DbSet<DmChannel> DmChannels { get; set; }
    public DbSet<DmMessage> DmMessages { get; set; }


    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Username)
            .IsUnique();
        modelBuilder.Entity<User>()
            .HasMany(u => u.PgpKeys)
            .WithOne(k => k.User)
            .HasForeignKey(k => k.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // ---- E2EE channel entities ---------------------------------------
        // Phase 2 of the E2EE rewrite. We keep the
        // DbSet registration alongside the legacy
        // Channels table — the migration to drop
        // plaintext is a separate project. The new
        // tables live in the same physical database but
        // under names that don't collide with the
        // existing models.
        var e2eeChannel = modelBuilder.Entity<Chattr.Core.Entities.E2EE.Channel>();
        e2eeChannel.HasIndex(c => c.Name);
        e2eeChannel.HasOne(c => c.CreatedByUser)
            .WithMany()
            .HasForeignKey(c => c.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        var e2eeChannelMember = modelBuilder.Entity<Chattr.Core.Entities.E2EE.ChannelMember>();
        e2eeChannelMember.HasIndex(m => new { m.ChannelId, m.UserId }).IsUnique();
        e2eeChannelMember.HasOne(m => m.Channel)
            .WithMany()
            .HasForeignKey(m => m.ChannelId)
            .OnDelete(DeleteBehavior.Cascade);
        e2eeChannelMember.HasOne(m => m.User)
            .WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        var e2eeMessage = modelBuilder.Entity<Chattr.Core.Entities.E2EE.Message>();
        e2eeMessage.HasIndex(m => new { m.ChannelId, m.CreatedAt });
        e2eeMessage.HasOne(m => m.Channel)
            .WithMany()
            .HasForeignKey(m => m.ChannelId)
            .OnDelete(DeleteBehavior.Cascade);
        e2eeMessage.HasOne(m => m.Sender)
            .WithMany()
            .HasForeignKey(m => m.SenderId)
            .OnDelete(DeleteBehavior.Restrict);

        var e2eeGroupChannelKey = modelBuilder.Entity<Chattr.Core.Entities.E2EE.GroupChannelKey>();
        e2eeGroupChannelKey.HasIndex(k => new { k.ChannelId, k.UserId, k.KeyVersion });
        e2eeGroupChannelKey.HasOne(k => k.Channel)
            .WithMany()
            .HasForeignKey(k => k.ChannelId)
            .OnDelete(DeleteBehavior.Cascade);
        e2eeGroupChannelKey.HasOne(k => k.User)
            .WithMany()
            .HasForeignKey(k => k.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<UserPgpKey>().HasIndex(k => k.UserId).IsUnique();

        // ---- Guild / Member / Role ----
        modelBuilder.Entity<Guild>().HasIndex(g => g.Name);
        // Vanity slug is unique (when set). Postgres treats
        // nulls as distinct in unique indexes by default, so
        // multiple guilds with NULL VanitySlug coexist fine —
        // only the non-null ones have to be unique.
        modelBuilder.Entity<Guild>().HasIndex(g => g.VanitySlug).IsUnique();

        modelBuilder.Entity<GuildMember>()
            .HasOne(m => m.User).WithMany(u => u.GuildMembers).HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildMember>()
            .HasOne(m => m.Guild).WithMany(g => g.Members).HasForeignKey(m => m.GuildId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildMember>()
            .HasOne(m => m.Role).WithMany().HasForeignKey(m => m.RoleId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<GuildMember>()
            .HasIndex(m => new { m.UserId, m.GuildId }).IsUnique();

        // ---- GuildMemberRole (m:n side-channel for additional roles) ----
        // Distinct from the primary RoleId: lets a member carry
        // several roles in a guild (the spec's multi-role model).
        // The unique key is (GuildMemberId, RoleId); a separate
        // index on RoleId backs the "all members of role X"
        // query. Both FKs cascade so deleting a member or a
        // role cleans up the join rows automatically.
        modelBuilder.Entity<GuildMemberRole>()
            .HasKey(x => new { x.GuildMemberId, x.RoleId });
        modelBuilder.Entity<GuildMemberRole>()
            .HasOne(x => x.Member)
            .WithMany(m => m.AdditionalRoles)
            .HasForeignKey(x => x.GuildMemberId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildMemberRole>()
            .HasOne(x => x.Role)
            .WithMany()
            .HasForeignKey(x => x.RoleId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildMemberRole>().HasIndex(x => x.RoleId);

        // ---- GuildRole ----
        modelBuilder.Entity<GuildRole>()
            .HasOne(r => r.Guild).WithMany().HasForeignKey(r => r.GuildId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildRole>()
            .HasIndex(r => new { r.GuildId, r.Name }).IsUnique();
        modelBuilder.Entity<GuildRole>()
            .HasOne(r => r.Permissions).WithOne(p => p.Role!)
            .HasForeignKey<GuildRolePermissions>(p => p.RoleId)
            .OnDelete(DeleteBehavior.Cascade);

        // ---- GuildInvite ----
        modelBuilder.Entity<GuildInvite>().HasIndex(i => i.GuildId);
        modelBuilder.Entity<GuildInvite>()
            .HasOne(i => i.Guild).WithMany().HasForeignKey(i => i.GuildId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildInvite>()
            .HasOne(i => i.IssuedBy).WithMany().HasForeignKey(i => i.IssuedById)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- GuildBan ----
        modelBuilder.Entity<GuildBan>().HasIndex(b => new { b.GuildId, b.UserId }).IsUnique();
        modelBuilder.Entity<GuildBan>()
            .HasOne(b => b.Guild).WithMany().HasForeignKey(b => b.GuildId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildBan>()
            .HasOne(b => b.User).WithMany().HasForeignKey(b => b.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildBan>()
            .HasOne(b => b.BannedBy).WithMany().HasForeignKey(b => b.BannedById)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- GuildVouch ----
        // One vouch per (Guild, User) pair. The unique index
        // also backs the "have I already vouched?" check on
        // POST so we get an indexed scan rather than a count.
        modelBuilder.Entity<GuildVouch>().HasIndex(v => new { v.GuildId, v.UserId }).IsUnique();
        modelBuilder.Entity<GuildVouch>()
            .HasOne(v => v.Guild).WithMany().HasForeignKey(v => v.GuildId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildVouch>()
            .HasOne(v => v.User).WithMany().HasForeignKey(v => v.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // ---- Channel ----
        modelBuilder.Entity<Channel>().HasIndex(c => new { c.GuildId, c.Position });
        modelBuilder.Entity<Channel>()
            .HasOne(c => c.Guild).WithMany().HasForeignKey(c => c.GuildId)
            .OnDelete(DeleteBehavior.Cascade);

        // ---- Message ----
        modelBuilder.Entity<Message>().HasIndex(m => new { m.ChannelId, m.CreatedAt });
        modelBuilder.Entity<Message>()
            .HasOne(m => m.Channel).WithMany().HasForeignKey(m => m.ChannelId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Message>()
            .HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- DmChannel / DmMessage ----
        modelBuilder.Entity<DmChannel>().HasIndex(d => new { d.UserAId, d.UserBId }).IsUnique();
        modelBuilder.Entity<DmChannel>().HasIndex(d => d.LastMessageAt);
        modelBuilder.Entity<DmChannel>()
            .HasOne(d => d.UserA).WithMany().HasForeignKey(d => d.UserAId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<DmChannel>()
            .HasOne(d => d.UserB).WithMany().HasForeignKey(d => d.UserBId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<DmMessage>().HasIndex(m => new { m.DmChannelId, m.CreatedAt });
        modelBuilder.Entity<DmMessage>()
            .HasOne(m => m.DmChannel).WithMany().HasForeignKey(m => m.DmChannelId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<DmMessage>()
            .HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- Platform-level tables ----
        modelBuilder.Entity<PlatformInvite>().HasIndex(p => p.Code).IsUnique();
        modelBuilder.Entity<SystemSetting>().HasKey(s => s.Key);
        modelBuilder.Entity<SystemSetting>().HasIndex(s => s.Key).IsUnique();
    }
}
