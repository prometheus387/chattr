using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Chattr.Infrastructure.Migrations
{
    /// <summary>
    /// Switches the User primary key (and the FK columns in PlatformInvites)
    /// from <c>uuid</c> to <c>integer</c> so profile URLs can use plain
    /// numbers like <c>/i/42</c> instead of GUIDs.
    ///
    /// The migration temporarily drops the FK constraints, runs the type
    /// changes (with a deterministic hash to keep any pre-existing rows),
    /// then re-creates the FK constraints. The hash won't match cross-table
    /// references, so any pre-existing PlatformInvites would have orphaned
    /// FKs after the migration — those are fixed in a follow-up cleanup
    /// step in dev databases.
    /// </summary>
    public partial class SwitchUserIdToInt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Drop the legacy redundant unique indexes.
            migrationBuilder.DropIndex(
                name: "IX_Users_Id",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_PlatformInvites_Id",
                table: "PlatformInvites");

            // 2. Drop the FK constraints so the column types can change.
            //    They're re-created at the end of the migration.
            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" DROP CONSTRAINT IF EXISTS \"FK_PlatformInvites_Users_CreatedById\";");
            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" DROP CONSTRAINT IF EXISTS \"FK_PlatformInvites_Users_UsedById\";");

            // 3. uuid → integer USING hashtextextended. Deterministic and
            //    bounded inside int4. New rows after this point get fresh
            //    IDs from the SERIAL/IDENTITY sequence.
            migrationBuilder.Sql(
                "ALTER TABLE \"Users\" ALTER COLUMN \"Id\" DROP DEFAULT;");
            migrationBuilder.Sql(
                "ALTER TABLE \"Users\" ALTER COLUMN \"Id\" TYPE integer " +
                "USING (abs(hashtextextended(\"Id\"::text, 0))::bigint % 2147483647)::integer;");

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "Users",
                type: "integer",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid")
                .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn);

            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" ALTER COLUMN \"Id\" DROP DEFAULT;");
            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" ALTER COLUMN \"Id\" TYPE integer " +
                "USING (abs(hashtextextended(\"Id\"::text, 0))::bigint % 2147483647)::integer;");

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "PlatformInvites",
                type: "integer",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid")
                .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn);

            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" ALTER COLUMN \"UsedById\" TYPE integer " +
                "USING (abs(hashtextextended(\"UsedById\"::text, 0))::bigint % 2147483647)::integer;");

            migrationBuilder.AlterColumn<int>(
                name: "UsedById",
                table: "PlatformInvites",
                type: "integer",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" ALTER COLUMN \"CreatedById\" TYPE integer " +
                "USING (abs(hashtextextended(\"CreatedById\"::text, 0))::bigint % 2147483647)::integer;");

            migrationBuilder.AlterColumn<int>(
                name: "CreatedById",
                table: "PlatformInvites",
                type: "integer",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            // 4. Re-create the FK constraints. They'll only succeed if any
            //    existing PlatformInvites rows happen to reference users
            //    whose hashed IDs match — in our dev database the tables
            //    are empty, so this is a no-op.
            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" " +
                "ADD CONSTRAINT \"FK_PlatformInvites_Users_CreatedById\" " +
                "FOREIGN KEY (\"CreatedById\") REFERENCES \"Users\"(\"Id\") ON DELETE SET NULL;");
            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" " +
                "ADD CONSTRAINT \"FK_PlatformInvites_Users_UsedById\" " +
                "FOREIGN KEY (\"UsedById\") REFERENCES \"Users\"(\"Id\") ON DELETE SET NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" DROP CONSTRAINT IF EXISTS \"FK_PlatformInvites_Users_CreatedById\";");
            migrationBuilder.Sql(
                "ALTER TABLE \"PlatformInvites\" DROP CONSTRAINT IF EXISTS \"FK_PlatformInvites_Users_UsedById\";");

            migrationBuilder.AlterColumn<Guid>(
                name: "Id",
                table: "Users",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer")
                .OldAnnotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Id",
                table: "Users",
                column: "Id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformInvites_Id",
                table: "PlatformInvites",
                column: "Id",
                unique: true);
        }
    }
}
