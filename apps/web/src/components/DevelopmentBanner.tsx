export function DevelopmentBanner(): React.JSX.Element {
  return (
    <div className="ottie-banner" role="status" data-testid="development-banner">
      Incomplete development prototype. Scenes are schematic, all traffic assets are quarantined (release_ready=false) and
      semantic validation has not run. Nothing shown is approved study material.
    </div>
  );
}
