import assertRevert from './helpers/assertRevert'
import expectThrow from './helpers/expectThrow'
import assertBalance from './helpers/assertBalance'

const Registry = artifacts.require("Registry")
const TrueUSD = artifacts.require("TrueUSD")
const BalanceSheet = artifacts.require("BalanceSheet")
const AllowanceSheet = artifacts.require("AllowanceSheet")
const ForceEther = artifacts.require("ForceEther")
const GlobalPause = artifacts.require("GlobalPause")

contract('RedeemToken', function (accounts) {
    const [_, owner, oneHundred, anotherAccount, cannotBurn] = accounts
    const notes = "some notes"
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

    describe('--Redeemable Token--', function () {
        beforeEach(async function () {
            this.registry = await Registry.new({ from: owner })
            this.balances = await BalanceSheet.new({ from: owner })
            this.allowances = await AllowanceSheet.new({ from: owner })
            this.token = await TrueUSD.new({ from: owner })
            await this.token.initialize(0, { from: owner })
            this.globalPause = await GlobalPause.new({ from: owner })
            await this.token.setGlobalPause(this.globalPause.address, { from: owner })    
            await this.token.setRegistry(this.registry.address, { from: owner })
            await this.balances.transferOwnership(this.token.address, { from: owner })
            await this.allowances.transferOwnership(this.token.address, { from: owner })
            await this.token.setBalanceSheet(this.balances.address, { from: owner })
            await this.token.setAllowanceSheet(this.allowances.address, { from: owner })

            await this.registry.setAttribute(oneHundred, "hasPassedKYC/AML", 1, notes, { from: owner })
            await this.token.mint(oneHundred, 100*10**18, { from: owner })
            await this.registry.setAttribute(oneHundred, "hasPassedKYC/AML", 0, notes, { from: owner })

            await this.registry.setAttribute(oneHundred, "canBurn", 1, notes, { from: owner })
            await this.token.setBurnBounds(5*10**18, 1000*10**18, { from: owner }) 
        })

        it('transfer to 0x0 burns trueUSD', async function(){
            await assertBalance(this.token, oneHundred, 100*10**18)
            await this.token.transfer(ZERO_ADDRESS, 10*10**18, {from : oneHundred})
            await assertBalance(this.token, oneHundred, 90*10**18)
            const totalSupply = await this.token.totalSupply()
            assert.equal(Number(totalSupply),90*10**18)
        })

        it('transfer to 0x0 generates burn event', async function(){
            const {logs} = await this.token.transfer(ZERO_ADDRESS, 10*10**18, {from : oneHundred})
            
            assert.equal(logs[0].event, 'Burn')
            assert.equal(logs[0].args.burner,oneHundred)
            assert.equal(Number(logs[0].args.value),10*10**18)

            assert.equal(logs[1].event, 'Transfer')
            assert.equal(logs[1].args.from,oneHundred)
            assert.equal(logs[1].args.to,ZERO_ADDRESS)
            assert.equal(Number(logs[1].args.value),10*10**18)
        })

        it('transfer to 0x0 will fail if user does not have canBurn attribute', async function(){
            await this.token.transfer(anotherAccount, 20*10**18, {from : oneHundred})
            await assertBalance(this.token, anotherAccount, 20*10**18)
            await assertRevert(this.token.transfer(ZERO_ADDRESS, 10*10**18, {from : anotherAccount}))
        })

        it('transferFrom to 0x0 fails', async function(){
            await this.token.approve(anotherAccount, 10*10**18, {from : oneHundred})
            await assertRevert(this.token.transferFrom(oneHundred,ZERO_ADDRESS, 10*10**18, {from : anotherAccount}))
        })
        
        describe('--Redemption Addresses--', function () {
            const ADDRESS_ONE = '0x0000000000000000000000000000000000000001'
            const ADDRESS_TWO = '0x0000000000000000000000000000000000000002'

            it('owner can increment Redemption address count', async function(){
                await this.token.incrementRedemptionAddressCount({ from: owner })
                assert.equal(Number(await this.token.redemptionAddressCount()),1)
            })

            it('transfers to Redemption addresses gets burned', async function(){
                await this.registry.setAttribute(ADDRESS_ONE, "canBurn", 1, notes, { from: owner })
                await this.registry.setAttribute(ADDRESS_TWO, "canBurn", 1, notes, { from: owner })
                await this.token.incrementRedemptionAddressCount({ from: owner })
                const {logs} = await this.token.transfer(ADDRESS_ONE, 10*10**18, {from : oneHundred})
                assert.equal(logs[0].event, 'Transfer')
                assert.equal(logs[1].event, 'Burn')
                assert.equal(logs[2].event, 'Transfer')
                await assertBalance(this.token, oneHundred, 90*10**18)
                assert.equal(Number(await this.token.totalSupply()),90*10**18)
                await this.token.transfer(ADDRESS_TWO, 10*10**18, {from : oneHundred})
                assert.equal(Number(await this.token.totalSupply()),90*10**18)
                await this.token.incrementRedemptionAddressCount({ from: owner })
                await this.token.transfer(ADDRESS_ONE, 10*10**18, {from : oneHundred})
                assert.equal(Number(await this.token.totalSupply()),80*10**18)
            })

            it('transfers to Redemption addresses fails if Redemption address cannot burn', async function(){
                await this.token.incrementRedemptionAddressCount({ from: owner })
                await assertRevert(this.token.transfer(ADDRESS_ONE, 10*10**18, {from : oneHundred}))
            })

            it('does not pay transfer fee and burn fee', async function(){
                await this.registry.setAttribute(ADDRESS_ONE, "canBurn", 1, notes, { from: owner })
                const amount = 48*10**18        
                await this.token.changeStakingFees(2, 20, 2, 20, 5*10**18, 2, 20, 5*10**18, { from: owner })
                const fee = Math.floor(amount * 2 / 20) + 5*10**18
                await this.token.incrementRedemptionAddressCount({ from: owner })
                await this.token.transfer(ADDRESS_ONE, amount, {from : oneHundred})
                await assertBalance(this.token, oneHundred, 100*10**18 - amount)
                await assertBalance(this.token, owner, fee)    
            })
        })
    })
})