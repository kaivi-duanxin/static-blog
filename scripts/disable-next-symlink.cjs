const fs = require('fs')

// Force Next's standalone file copier to fall back to plain copies on Windows.
// This avoids EPERM failures when the filesystem does not allow symlink creation.
const patchedReadlink = async () => {
  const err = new Error('symlink disabled for local deploy')
  err.code = 'EINVAL'
  throw err
}

fs.promises.readlink = patchedReadlink
const originalCopyFile = fs.promises.copyFile.bind(fs.promises)
fs.promises.copyFile = async (src, dest, flags) => {
  const stats = await fs.promises.stat(src).catch(() => null)
  if (stats && stats.isDirectory()) {
    await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => {})
    await fs.promises.cp(src, dest, {
      dereference: true,
      force: true,
      recursive: true,
    })
    return
  }
  return originalCopyFile(src, dest, flags)
}
fs.readlink = (path, options, callback) => {
  if (typeof options === 'function') {
    callback = options
  }
  const err = new Error('symlink disabled for local deploy')
  err.code = 'EINVAL'
  if (typeof callback === 'function') callback(err)
}
