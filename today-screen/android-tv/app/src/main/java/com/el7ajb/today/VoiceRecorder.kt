package com.el7ajb.today

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.ByteArrayOutputStream
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Records 16 kHz mono PCM from the default mic (on the Mi Box that is the remote's mic)
 * and returns it as a WAV file. Reports a level about every 100 ms, and tells you when
 * the person has stopped talking, or when the mic gives no sound at all.
 */
class VoiceRecorder(
    private val onLevel: (Float) -> Unit,
    private val onSilence: () -> Unit,
    private val onNoInput: () -> Unit,
) {
    private val rate = 16000
    private var record: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    private val pcm = ByteArrayOutputStream()

    @SuppressLint("MissingPermission")
    fun start(): Boolean {
        val minBuf = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuf <= 0) return false
        val r = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 4,
            )
        } catch (e: Exception) {
            return false
        }
        if (r.state != AudioRecord.STATE_INITIALIZED) { r.release(); return false }
        try { r.startRecording() } catch (e: Exception) { r.release(); return false }
        if (r.recordingState != AudioRecord.RECORDSTATE_RECORDING) { r.release(); return false }

        record = r
        running = true
        pcm.reset()
        thread = Thread {
            val buf = ShortArray(rate / 10)
            val bytes = ByteArray(buf.size * 2)
            var heard = false
            var quietMs = 0
            var totalMs = 0
            var anySound = false
            var reportedNoInput = false
            while (running) {
                val n = r.read(buf, 0, buf.size)
                if (n <= 0) continue
                var sum = 0.0
                for (i in 0 until n) {
                    val s = buf[i].toInt()
                    val d = s.toDouble()
                    sum += d * d
                    bytes[2 * i] = (s and 0xff).toByte()
                    bytes[2 * i + 1] = ((s shr 8) and 0xff).toByte()
                }
                synchronized(pcm) { pcm.write(bytes, 0, n * 2) }
                val level = min(1.0, sqrt(sum / n) / 32768.0 * 6.0).toFloat()
                onLevel(level)

                val ms = n * 1000 / rate
                totalMs += ms
                if (level > 0.02f) anySound = true
                if (!anySound && !reportedNoInput && totalMs > 6000) { reportedNoInput = true; onNoInput() }
                if (level > 0.12f) { heard = true; quietMs = 0 }
                else if (heard) {
                    quietMs += ms
                    if (quietMs > 1800) { heard = false; onSilence() }
                }
            }
        }.also { it.start() }
        return true
    }

    fun isRecording() = running

    fun seconds(): Float = synchronized(pcm) { pcm.size() / (rate * 2f) }

    /** Stops and returns WAV bytes. Call off the main thread. */
    fun stop(): ByteArray {
        halt()
        val data = synchronized(pcm) { pcm.toByteArray() }
        return wav(data)
    }

    fun cancel() { halt() }

    private fun halt() {
        running = false
        try { thread?.join(600) } catch (_: InterruptedException) {}
        try { record?.stop() } catch (_: Exception) {}
        record?.release()
        record = null
        thread = null
    }

    private fun wav(data: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(44 + data.size)
        fun str(s: String) = out.write(s.toByteArray(Charsets.US_ASCII))
        fun i32(v: Int) { out.write(v and 0xff); out.write((v shr 8) and 0xff); out.write((v shr 16) and 0xff); out.write((v shr 24) and 0xff) }
        fun i16(v: Int) { out.write(v and 0xff); out.write((v shr 8) and 0xff) }
        str("RIFF"); i32(36 + data.size); str("WAVE")
        str("fmt "); i32(16); i16(1); i16(1); i32(rate); i32(rate * 2); i16(2); i16(16)
        str("data"); i32(data.size)
        out.write(data)
        return out.toByteArray()
    }
}
