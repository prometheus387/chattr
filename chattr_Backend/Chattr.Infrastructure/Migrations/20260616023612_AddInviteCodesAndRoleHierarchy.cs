using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chattr.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInviteCodesAndRoleHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ---- Add new columns ----
            migrationBuilder.AddColumn<bool>(
                name: "DisplaySeparately",
                table: "GuildRoles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "IconSvg",
                table: "GuildRoles",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Position",
                table: "GuildRoles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "CanCreateInvite",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanManageRoles",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "GuildInvites",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "GuildInvites",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "UseCount",
                table: "GuildInvites",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // ---- Backfill CreatedAt on existing invites ----
            // The auto-gen default is 0001-01-01; replace it with now() so
            // existing rows have a sane timestamp.
            migrationBuilder.Sql(@"
                UPDATE ""GuildInvites""
                SET ""CreatedAt"" = now()
                WHERE ""CreatedAt"" = TIMESTAMP '0001-01-01 00:00:00';
            ");

            // ---- Backfill unique-ish codes for any pre-existing rows ----
            // (There shouldn't be any in dev, but the backfill keeps the
            // NOT NULL constraint honest if someone hand-inserted.)
            migrationBuilder.Sql(@"
                UPDATE ""GuildInvites""
                SET ""Code"" = 'legacy_' || ""Id""::text
                WHERE ""Code"" = '';
            ");

            // ---- Unique index on Code so lookup-by-code is O(log n) ----
            migrationBuilder.CreateIndex(
                name: "IX_GuildInvites_Code",
                table: "GuildInvites",
                column: "Code",
                unique: true);

            // ---- Demote existing @everyone roles to non-admin ----
            // The previous design made @everyone itself the admin role.
            // The new design wants a separate @admin role for owners,
            // and @everyone must be permission-less by default. After
            // this update @everyone has IsAdministrator=false.
            migrationBuilder.Sql(@"
                UPDATE ""GuildRolePermissions"" p
                SET ""IsAdministrator"" = false
                FROM ""GuildRoles"" r
                WHERE p.""RoleId"" = r.""Id""
                  AND r.""Name"" = '@everyone'
                  AND p.""IsAdministrator"" = true;
            ");

            // ---- Create a new @admin role per existing guild ----
            // Idempotent: only inserts if the guild doesn't already have
            // an @admin role (covers the case where a test guild has
            // already been hand-seeded).
            migrationBuilder.Sql(@"
                INSERT INTO ""GuildRoles"" (""GuildId"", ""Name"", ""Color"", ""Position"", ""DisplaySeparately"")
                SELECT g.""Id"", '@admin', '#f0b232', 100, true
                FROM ""Guilds"" g
                WHERE NOT EXISTS (
                    SELECT 1 FROM ""GuildRoles"" r
                    WHERE r.""GuildId"" = g.""Id"" AND r.""Name"" = '@admin'
                );
            ");

            // ---- Permissions for the new @admin role ----
            migrationBuilder.Sql(@"
                INSERT INTO ""GuildRolePermissions"" (""RoleId"", ""IsAdministrator"",
                    ""CanDeleteMessages"", ""CanManageChannels"", ""BypassSlowmode"",
                    ""CanBanMembers"", ""CanKickMembers"", ""CanDeafenMembers"",
                    ""CanMuteMembers"", ""CanTimeoutMembers"",
                    ""CanChangeOwnNickname"", ""CanChangeNickName"",
                    ""CanManageRoles"", ""CanCreateInvite"")
                SELECT r.""Id"", true,
                    false, false, false, false, false, false, false, false, false, false,
                    true, true
                FROM ""GuildRoles"" r
                WHERE r.""Name"" = '@admin'
                  AND NOT EXISTS (
                    SELECT 1 FROM ""GuildRolePermissions"" p WHERE p.""RoleId"" = r.""Id""
                  );
            ");

            // ---- Move each owner to the new @admin role ----
            // The owner had @everyone-as-admin before; with @everyone
            // demoted and a fresh @admin available, point the owner's
            // GuildMember at the @admin row. IsOwner stays true so the
            // ownership-transfer logic still works.
            migrationBuilder.Sql(@"
                UPDATE ""GuildMembers"" m
                SET ""RoleId"" = a.""Id""
                FROM ""GuildRoles"" a
                WHERE a.""GuildId"" = m.""GuildId""
                  AND a.""Name"" = '@admin'
                  AND m.""IsOwner"" = true;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GuildInvites_Code",
                table: "GuildInvites");

            migrationBuilder.DropColumn(
                name: "DisplaySeparately",
                table: "GuildRoles");

            migrationBuilder.DropColumn(
                name: "IconSvg",
                table: "GuildRoles");

            migrationBuilder.DropColumn(
                name: "Position",
                table: "GuildRoles");

            migrationBuilder.DropColumn(
                name: "CanCreateInvite",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "CanManageRoles",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "Code",
                table: "GuildInvites");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "GuildInvites");

            migrationBuilder.DropColumn(
                name: "UseCount",
                table: "GuildInvites");
        }
    }
}
