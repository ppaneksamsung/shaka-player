/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('Offline', () => {
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.offline.Storage} */
  let storage;
  /** @type {!HTMLVideoElement} */
  let video;

  beforeAll(function() {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  beforeEach(async function() {
    player = new shaka.Player(video);
    player.addEventListener('error', fail);

    if (supportsStorage()) {
      // Make sure we are starting with a blank slate.
      await shaka.offline.Storage.deleteAll();
      storage = new shaka.offline.Storage(player);
    }
  });

  afterEach(async function() {
    if (storage) {
      await storage.destroy();
    }

    // Make sure we don't leave anything in storage after the test.
    if (supportsStorage()) {
      await shaka.offline.Storage.deleteAll();
    }

    if (player) {
      await player.destroy();
    }
  });

  it('stores, plays, and deletes clear content', async function() {
    if (!supportsStorage()) {
      pending('Storage is not supported.');
      return;
    }

    let content = await storage.store('test:sintel');
    expect(content).toBeTruthy();

    let contentUri = content.offlineUri;
    goog.asserts.assert(
        contentUri, 'Stored content should have an offline uri.');

    await player.load(content.offlineUri);

    video.play();
    await playTo(/* end= */ 3, /* timeout= */ 10);

    expect(video.currentTime).toBeGreaterThan(3);
    expect(video.ended).toBe(false);

    await player.unload();
    await storage.remove(contentUri);
  });

  // TODO: Add a PlayReady version once Edge supports offline.
  drmIt(
      'stores, plays, and deletes protected content with a persistent license',
      async function() {
        if (!supportsStorage()) {
          pending('Storage is not supported on this platform.');
          return;
        }

        let support = await shaka.Player.probeSupport();
        let widevineSupport = support.drm['com.widevine.alpha'];

        if (!widevineSupport || !widevineSupport.persistentState) {
          pending('Widevine persistent licenses are not supported');
          return;
        }

        shaka.test.TestScheme.setupPlayer(player, 'sintel-enc');

        storage.configure({usePersistentLicense: true});
        let content = await storage.store('test:sintel-enc');

        // Work around http://crbug.com/887535 in which load cannot happen right
        // after close.  Experimentally, we seem to need a ~1s delay, so we're
        // using a 3s delay to ensure it doesn't flake.  Without this, we get
        // error 6005 (FAILED_TO_CREATE_SESSION) with system code 70.
        // TODO: Remove when Chrome is fixed
        await shaka.test.Util.delay(3);

        let contentUri = content.offlineUri;
        goog.asserts.assert(
            contentUri, 'Stored content should have an offline uri.');

        await player.load(contentUri);

        video.play();
        await playTo(/* end= */ 3, /* timeout= */ 10);

        expect(video.currentTime).toBeGreaterThan(3);
        expect(video.ended).toBe(false);

        await player.unload();
        await storage.remove(contentUri);
      });

  drmIt(
      'stores, plays, and deletes protected content with a temporary license',
      async function() {
        if (!supportsStorage()) {
          pending('Storage is not supported.');
          return;
        }

        let support = await shaka.Player.probeSupport();
        let widevineSupport = support.drm['com.widevine.alpha'];
        let playreadySupport = support.drm['com.microsoft.playready'];

        if (!(widevineSupport || playreadySupport)) {
          pending('Widevine and PlayReady are not supported');
          return;
        }

        // Because we do not need a persistent license, we also do not need init
        // data in the manifest.  Using this covers issue #1159, where we used
        // to throw an error inappropriately.
        shaka.test.TestScheme.setupPlayer(player, 'multidrm_no_init_data');

        storage.configure({usePersistentLicense: false});
        let content = await storage.store('test:multidrm_no_init_data');

        let contentUri = content.offlineUri;
        goog.asserts.assert(
            contentUri, 'Stored content should have an offline uri.');

        await player.load(contentUri);

        video.play();
        await playTo(/* end= */ 3, /* timeout= */ 10);

        expect(video.currentTime).toBeGreaterThan(3);
        expect(video.ended).toBe(false);

        await player.unload();
        await storage.remove(contentUri);
      });

  /**
   * Assume that the media element is playing content from time=0. This will
   * wait until the media element has passed |time=endSeconds| or until
   * |timeoutSeconds| has passed (in real time).
   *
   * The promise returned will only resolve. To know if playback was
   * successful, check |currentTime| on the media element.
   *
   * @param {number} endSeconds
   * @param {number} timeoutSeconds
   * @return {!Promise}
   */
  async function playTo(endSeconds, timeoutSeconds) {
    /** @type {number} */
    const timeoutMs = timeoutSeconds * 1000;
    /** @type {number} */
    const startMs = Date.now();

    while (Date.now() - startMs < timeoutMs) {
      if (video.currentTime > endSeconds) {
        return;
      }

      // |await| in loops is black-listed by eslint because it means you are not
      // using parallelism to its fullest, but here we want serialization.
      //
      // eslint-disable-next-line no-await-in-loop
      await shaka.test.Util.delay(/* seconds= */ 1);
    }
  }

  /** @return {boolean} */
  function supportsStorage() {
    return shaka.offline.Storage.support();
  }
});
