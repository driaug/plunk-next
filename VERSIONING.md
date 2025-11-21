# Versioning & Release Process

This document explains how versioning works in this repository and how Docker images are automatically versioned and published.

## How It Works

1. **Create PR with conventional commit title**
2. **Merge PR to main** (squash merge recommended)
3. **Release Please automatically**:
   - Analyzes commit messages
   - Determines next version
   - Creates/updates a "Release PR"
4. **Merge the Release PR**
5. **Git tag is created automatically**
6. **Docker images are built** with proper version tags

## PR Title Format (Conventional Commits)

Your PR title determines the version bump. Use these formats:

### Features (bumps MINOR version)
```
feat: add email template editor
feat: implement contact segmentation
feat: add webhook support
```
**Result**: 1.0.0 → 1.1.0

### Bug Fixes (bumps PATCH version)
```
fix: resolve memory leak in worker
fix: correct contact import validation
fix: handle empty email fields
```
**Result**: 1.0.0 → 1.0.1

### Breaking Changes (bumps MAJOR version)
```
feat!: redesign API authentication
fix!: change contact data structure
```
**Result**: 1.0.0 → 2.0.0

### No Version Bump
```
docs: update deployment guide
chore: update dependencies
style: fix linting issues
test: add contact service tests
refactor: simplify email queue logic
```
**Result**: No version change

## Complete Example Workflow

### Scenario: Adding a new feature

1. **Create branch and implement feature**
   ```bash
   git checkout -b feature/template-editor
   # ... make changes ...
   git commit -m "implement template editor"
   git push origin feature/template-editor
   ```

2. **Create PR with conventional title**
   - Title: `feat: add email template editor`
   - Description: Details about the feature

3. **Get approval and merge to main**
   - Use "Squash and merge" (recommended)
   - The PR title becomes the commit message

4. **Release Please automatically runs**
   - Sees the `feat:` commit
   - Determines MINOR version bump needed
   - Creates/updates a "Release PR" titled "chore(main): release 1.1.0"
   - The Release PR includes:
     - Updated package.json version
     - Updated CHANGELOG.md
     - All changes since last release

5. **Review and merge the Release PR**
   - Review the changelog
   - Merge the Release PR
   - Release Please automatically:
     - Creates git tag `v1.1.0`
     - Creates GitHub release with notes

6. **Docker workflow triggers automatically**
   - Detects new tag `v1.1.0`
   - Builds multi-arch images
   - Pushes to GitHub Container Registry with tags:
     - `ghcr.io/your-org/plunk:1.1.0`
     - `ghcr.io/your-org/plunk:1.1`
     - `ghcr.io/your-org/plunk:1`
     - `ghcr.io/your-org/plunk:latest`

## Quick Reference

| PR Title Prefix | Version Bump | Example |
|----------------|--------------|---------|
| `feat:` | MINOR (1.0.0 → 1.1.0) | New feature |
| `fix:` | PATCH (1.0.0 → 1.0.1) | Bug fix |
| `feat!:` or `fix!:` | MAJOR (1.0.0 → 2.0.0) | Breaking change |
| `docs:` | None | Documentation only |
| `chore:` | None | Maintenance |
| `refactor:` | None | Code refactoring |
| `test:` | None | Tests only |
| `style:` | None | Formatting |
| `perf:` | PATCH (1.0.0 → 1.0.1) | Performance improvement |

## Docker Image Tags

After each release, these tags are available:

```bash
# Specific version (recommended for production)
docker pull ghcr.io/drieam/plunk-v2:1.2.3

# Minor version (gets patch updates)
docker pull ghcr.io/drieam/plunk-v2:1.2

# Major version (gets minor and patch updates)
docker pull ghcr.io/drieam/plunk-v2:1

# Latest release (not recommended for production)
docker pull ghcr.io/drieam/plunk-v2:latest

# Specific commit (for testing/debugging)
docker pull ghcr.io/drieam/plunk-v2:main-abc1234
```

## Best Practices

### ✅ DO
- Use conventional commit format in PR titles
- Squash merge PRs to keep clean history
- Review Release PRs before merging
- Use specific version tags in production (e.g., `1.2.3`)
- Test with commit-based tags before releasing (e.g., `main-abc1234`)

### ❌ DON'T
- Don't create manual git tags (let Release Please handle it)
- Don't edit version in package.json manually
- Don't use `latest` tag in production
- Don't forget the type prefix (feat:, fix:, etc.)
- Don't merge Release PRs without reviewing the changelog

## Troubleshooting

### Release PR not created?
- Check that commits follow conventional format
- Ensure commits have releasable changes (feat, fix, perf, refactor with !)
- Check the GitHub Actions logs

### Docker images not building?
- Verify the git tag was created (check releases page)
- Check docker-publish.yml workflow logs
- Ensure GitHub Actions has write permissions to packages

### Wrong version bump?
- Edit the Release PR before merging
- Update the version in package.json in the Release PR
- The version you merge is what gets released

## Migration Notes

Since we're starting with version `1.0.0`, the first Release PR will be created after the next releasable commit is pushed to main.

To trigger the first release:
1. Merge a PR with title like `feat: initial automated release setup`
2. Wait for Release Please to create the Release PR
3. Review and merge the Release PR
4. Docker images will be built automatically

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Semantic Versioning](https://semver.org/)
