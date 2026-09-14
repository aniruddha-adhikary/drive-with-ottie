export function DevelopmentBanner(): React.JSX.Element {
  return (
    <div className="ottie-banner" role="status" data-testid="development-banner">
      Incomplete development prototype. Scenes are schematic and all traffic assets are quarantined (release_ready=false).
      Nothing shown is approved study material.
    </div>
  );
}
