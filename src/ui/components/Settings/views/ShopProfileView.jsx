import { Fragment, useState } from "react";
import { LuDownload, LuRefreshCw, LuUpload } from "react-icons/lu";
import { useStore } from "../../../store/useStore";
import { exportShopProfile } from "../../../services/profileService";
import { notify } from "@/utils/notify";
import { PROFILE_STATUS } from "@/utils/profileStatus";
import { profileOverview, profileStatusBadge, reloadResultNotice, exportResultNotice } from "@/utils/shopProfileView";
import { useProfileImport } from "../../../hooks/useProfileImport";
import styles from "./SettingsView.module.css";
import own from "./ShopProfileView.module.css";

// Settings -> Shop Profile (ETAP 3-4). The deployment-level configuration (PRODUCTIZATION: set by
// import, not edited here): a read-only view of what this station runs on, plus the profile file -
// Export and a two-phase Import (main previews, the operator confirms the diff, main applies). The
// import lives in useProfileImport since 4-wizard - the first-run wizard runs the same one.
const ShopProfileView = () => {
  const shopProfile = useStore((s) => s.shopProfile);
  const shopProfileStatus = useStore((s) => s.shopProfileStatus);
  const reloadShopData = useStore((s) => s.reloadShopData);
  const [busyAction, setBusy] = useState(null); // null | "reload" | "export"
  const { importing, importErrors, runImport } = useProfileImport();
  const busy = importing ? "import" : busyAction;

  const handleExport = async () => {
    setBusy("export");
    try {
      const res = await exportShopProfile();
      if (res?.canceled) return;
      notify(exportResultNotice(res));
    } catch (err) {
      notify({ type: "Error", title: "Export failed", message: err?.message || "Unknown error." });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = runImport;

  const handleReload = async () => {
    setBusy("reload");
    try {
      notify(reloadResultNotice(await reloadShopData()));
    } finally {
      setBusy(null);
    }
  };

  const failed = shopProfileStatus === PROFILE_STATUS.FAILED;
  const overview = profileOverview(shopProfile);
  const badge = profileStatusBadge(shopProfileStatus, shopProfile);

  return (
    <div className={`${styles.view} ${own.view_cards}`}>
      <div className={`${styles.view_header} ${own.header}`}>
        <div>
          <div className={own.title_row}>
            <h2 className={styles.view_title} style={{ margin: 0 }}>
              Shop Profile
            </h2>
            <span className={`${own.badge} ${own[`badge_${badge.tone}`]}`}>{badge.label}</span>
          </div>
          <p className={styles.view_desc}>
            How this shop works - printers, material classes, product sizes, folders, scanner rules. Set by importing a
            profile file; shared by every station. Read-only here.
          </p>
        </div>
        <div className={own.actions}>
          <button
            className={styles.browse_btn}
            onClick={handleReload}
            disabled={busy !== null}
            title="Re-read the shop profile and the fabric list from the shared database (reconnects it if needed)"
          >
            <LuRefreshCw size={15} />
            {busy === "reload" ? "Reloading…" : "Reload shop data"}
          </button>
          <button className={styles.browse_btn} onClick={handleExport} disabled={busy !== null || failed}>
            <LuDownload size={15} />
            {busy === "export" ? "Exporting…" : "Export"}
          </button>
          <button className={styles.save_btn} onClick={handleImport} disabled={busy !== null || failed}>
            <LuUpload size={15} />
            {busy === "import" ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
      <div className={styles.view_body}>
        {failed && (
          <div className={own.alert}>
            <div className={own.alert_title}>The shop profile could not be read</div>
            The database may be unreachable. Nothing below is shown until it is read - use Reload shop data once the
            network is back.
          </div>
        )}
        {importErrors.length > 0 && (
          <div className={own.alert}>
            <div className={own.alert_title}>The file was not imported</div>
            <ul>
              {importErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {overview && <ProfileCards overview={overview} />}
      </div>
    </div>
  );
};

const Card = ({ title, count, wide, children }) => (
  <section className={`${own.card} ${wide ? own.card_wide : ""}`}>
    <h3 className={own.card_title}>
      {title}
      {count !== undefined && <span className={own.count}>{count}</span>}
    </h3>
    {children}
  </section>
);

const Empty = ({ children = "none" }) => <p className={own.empty}>{children}</p>;

const StageChip = ({ chip }) => (
  <span
    className={own.chip}
    title={chip.stage}
    style={chip.color ? { backgroundColor: chip.color.bg, color: chip.color.color } : undefined}
  >
    {chip.label}
  </span>
);

const ProfileCards = ({ overview }) => (
  <div className={own.grid}>
    <Card title="Printers" count={overview.printers.length} wide>
      {overview.printers.length === 0 ? (
        <Empty>No printer - nothing can be printed until a profile is imported.</Empty>
      ) : (
        <div className={own.printers}>
          {overview.printers.map((p, i) => (
            <div key={`${p.code}-${i}`} className={own.printer} style={p.color ? { borderLeftColor: p.color.color } : undefined}>
              <span className={own.printer_code}>
                <span className={own.swatch} style={{ backgroundColor: p.color?.color ?? "var(--border-grey)" }} />
                {p.code}
              </span>
              <span className={own.chip} style={p.color ? { backgroundColor: p.color.bg, color: p.color.color } : undefined}>
                {p.materialClass}
              </span>
              <span className={own.mono} title={p.hotfolder}>
                {p.hotfolder}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>

    <Card title="Material classes" count={overview.materialClasses.length}>
      {overview.materialClasses.length === 0 ? (
        <Empty />
      ) : (
        <table className={own.table}>
          <thead>
            <tr>
              <th>Class</th>
              <th className={own.num}>Margin (mm)</th>
              <th className={own.num}>Roll width (mm)</th>
            </tr>
          </thead>
          <tbody>
            {overview.materialClasses.map((c, i) => (
              <tr key={`${c.name}-${i}`}>
                <td>{c.name}</td>
                <td className={own.num}>{c.margin}</td>
                <td className={own.num}>{c.defaultRollWidth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>

    <Card title="Product types" count={overview.productTypes.length}>
      {overview.productTypes.length === 0 ? (
        <Empty />
      ) : (
        <table className={own.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th className={own.num}>Width (mm)</th>
              <th className={own.num}>Height (mm)</th>
            </tr>
          </thead>
          <tbody>
            {overview.productTypes.map((t, i) => (
              <tr key={`${t.code}-${i}`}>
                <td>{t.code}</td>
                <td className={own.num}>{t.width}</td>
                <td className={own.num}>{t.height}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>

    <Card title="Scanner rules" count={overview.scanRules.length} wide>
      {overview.scanRules.length === 0 ? (
        <Empty />
      ) : (
        <div className={own.rules}>
          {overview.scanRules.map((r, i) => (
            <div key={`${r.role}-${i}`} className={own.rule}>
              <span className={own.role}>{r.role}</span>
              <StageChip chip={r.from} />
              <span className={own.arrow}>→</span>
              <StageChip chip={r.to} />
              {r.silent && <span className={own.silent}>silent when nothing to move</span>}
            </div>
          ))}
        </div>
      )}
    </Card>

    <Card title="Folders">
      {overview.folders.length === 0 ? (
        <Empty />
      ) : (
        <div className={own.kv}>
          {overview.folders.map((f) => (
            <Fragment key={f.key}>
              <span className={own.kv_key} title={f.key}>
                {f.label}
              </span>
              {f.value === null ? <span className={own.not_set}>not set</span> : <span className={own.mono}>{f.value}</span>}
            </Fragment>
          ))}
        </div>
      )}
    </Card>

    <Card title="Sewing, Shopify & custom orders">
      <div className={own.kv}>
        <span className={own.kv_key}>Sewing companies</span>
        {overview.sewingCompanies.length === 0 ? (
          <span className={own.not_set}>none</span>
        ) : (
          <div className={own.chips}>
            {overview.sewingCompanies.map((c, i) => (
              <span key={`${c}-${i}`} className={own.chip}>
                {c}
              </span>
            ))}
          </div>
        )}
        <span className={own.kv_key}>Shopify store</span>
        {overview.storeHandle === null ? <span className={own.not_set}>not set</span> : <span className={own.mono}>{overview.storeHandle}</span>}
        <span className={own.kv_key}>Custom orders class</span>
        {overview.customOrderClass === null ? (
          <span className={own.not_set}>not set</span>
        ) : (
          <span className={own.chip}>{overview.customOrderClass}</span>
        )}
      </div>
    </Card>

    <Card title="Features" wide>
      <div className={own.features}>
        {overview.features.map((f) => (
          <div key={f.flag} className={own.feature} title={f.flag}>
            {f.label}
            <span className={f.on ? own.pill_on : own.pill_off}>{f.on ? "ON" : "OFF"}</span>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

export default ShopProfileView;
